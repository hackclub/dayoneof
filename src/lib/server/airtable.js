import { config } from './config.js';

/** @typedef {{ id: string, fields: Record<string, any> }} AirtableRecord */
/** @typedef {{ field: string, direction?: 'asc' | 'desc' }} SortRule */

/** @param {string} table */
function baseUrl(table) {
	return `https://api.airtable.com/v0/${config.airtableBaseId}/${encodeURIComponent(table)}`;
}

/**
 * Builds an equality filterByFormula. Airtable has no bind parameters, so the value is escaped
 * here — otherwise a quote in a URL path segment or Slack message rewrites the formula.
 * @param {string} field
 * @param {string | number} value
 */
export function eq(field, value) {
	return `{${field}} = "${String(value).replace(/[\\"]/g, '\\$&')}"`;
}

function headers() {
	return {
		Authorization: `Bearer ${config.airtableToken}`,
		'Content-Type': 'application/json'
	};
}

// Airtable allows 5 requests a second per base and locks the base out for 30 seconds after a 429,
// so every request waits for its own slot instead of bursting.
const REQUEST_SPACING_MS = 220;
const RATE_LIMIT_WAIT_MS = 30_000;
const MAX_RATE_LIMIT_RETRIES = 2;
let nextSlot = 0;

/** @param {number} ms */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function waitForSlot() {
	const now = Date.now();
	const wait = Math.max(0, nextSlot - now);
	nextSlot = Math.max(now, nextSlot) + REQUEST_SPACING_MS;
	return sleep(wait);
}

/**
 * @param {string} url
 * @param {RequestInit} init
 * @param {number} [attempt]
 * @returns {Promise<any>}
 */
async function request(url, init, attempt = 0) {
	await waitForSlot();
	const res = await fetch(url, init);
	if (res.status === 429 && attempt < MAX_RATE_LIMIT_RETRIES) {
		await sleep(RATE_LIMIT_WAIT_MS);
		return request(url, init, attempt + 1);
	}
	if (!res.ok) {
		const body = await res.text();
		throw new Error(`airtable ${init?.method ?? 'GET'} ${url} failed: ${res.status} ${body}`);
	}
	return res.json();
}

const CACHE_TTL_MS = 60_000;
/** @typedef {Map<string, AirtableRecord | null>} Writes */
/**
 * @typedef {{ expires: number, gen: number, refreshing: boolean, options: { filterByFormula?: string, sort?: SortRule[] },
 *   writes: Writes, records: Promise<AirtableRecord[]> }} CacheEntry
 */
/** @type {Map<string, CacheEntry>} */
const cache = new Map();

/** @param {SortRule[]} sort */
function compareBy(sort) {
	/** @param {AirtableRecord} a @param {AirtableRecord} b */
	return (a, b) => {
		for (const { field, direction } of sort) {
			const x = a.fields[field];
			const y = b.fields[field];
			if (x === y) continue;
			if (x == null) return 1;
			if (y == null) return -1;
			return (x < y ? -1 : 1) * (direction === 'desc' ? -1 : 1);
		}
		return 0;
	};
}

/**
 * @param {AirtableRecord[]} records
 * @param {Writes} writes
 * @param {SortRule[]} [sort]
 */
function applyWrites(records, writes, sort) {
	if (!writes.size) return records;
	const byId = new Map(records.map((r) => [r.id, r]));
	for (const [id, record] of writes) {
		if (record) byId.set(id, record);
		else byId.delete(id);
	}
	const next = [...byId.values()];
	return sort ? next.sort(compareBy(sort)) : next;
}

// Unfiltered lists take the written records right away; a filtered one can't evaluate its formula
// here, so it only goes stale. Either way a background refresh picks up computed fields.
/**
 * @param {string} table
 * @param {Writes} writes
 */
function remember(table, writes) {
	for (const [key, entry] of cache) {
		if (!key.startsWith(`${table}:`)) continue;
		entry.expires = 0;
		entry.gen++;
		if (entry.options.filterByFormula) continue;
		for (const [id, record] of writes) entry.writes.set(id, record);
		entry.records = entry.records.then((r) => applyWrites(r, writes, entry.options.sort));
		entry.records.catch(() => {});
	}
}

/**
 * @param {string} table
 * @param {string} filterByFormula
 * @returns {Promise<AirtableRecord | null>}
 */
export async function find(table, filterByFormula) {
	const url = `${baseUrl(table)}?filterByFormula=${encodeURIComponent(filterByFormula)}&maxRecords=1`;
	const data = await request(url, { headers: headers() });
	return data.records[0] ?? null;
}

/**
 * @param {string} table
 * @param {{ filterByFormula?: string, sort?: SortRule[] }} [options]
 * @returns {Promise<AirtableRecord[]>}
 */
export async function list(table, { filterByFormula, sort } = {}) {
	const records = [];
	let offset;
	do {
		const params = new URLSearchParams();
		if (filterByFormula) params.set('filterByFormula', filterByFormula);
		if (sort)
			sort.forEach((s, i) => {
				params.set(`sort[${i}][field]`, s.field);
				params.set(`sort[${i}][direction]`, s.direction ?? 'asc');
			});
		if (offset) params.set('offset', offset);
		const data = await request(`${baseUrl(table)}?${params}`, { headers: headers() });
		records.push(...data.records);
		offset = data.offset;
	} while (offset);
	return records;
}

// For the public pages: every visitor shares one fetch. Once it expires or a write marks it stale,
// visitors get the last good list while a single refresh runs, so only a cold start waits.
/**
 * @param {string} table
 * @param {{ filterByFormula?: string, sort?: SortRule[] }} [options]
 * @returns {Promise<AirtableRecord[]>}
 */
export function listCached(table, options = {}) {
	const key = `${table}:${JSON.stringify(options)}`;
	const hit = cache.get(key);
	if (hit && (hit.expires > Date.now() || hit.refreshing)) return hit.records;
	const records = list(table, options);
	if (!hit) {
		const entry = {
			expires: Date.now() + CACHE_TTL_MS,
			gen: 0,
			refreshing: false,
			options,
			writes: new Map(),
			records
		};
		cache.set(key, entry);
		records.catch(() => cache.delete(key));
		return entry.records;
	}
	const gen = hit.gen;
	const writes = (hit.writes = new Map());
	hit.refreshing = true;
	records
		.then((fresh) => {
			hit.records = Promise.resolve(applyWrites(fresh, writes, options.sort));
			if (hit.gen === gen) hit.expires = Date.now() + CACHE_TTL_MS;
		})
		.catch((err) => console.error('airtable cache refresh failed', table, err))
		.finally(() => {
			hit.refreshing = false;
		});
	return hit.records;
}

/**
 * @param {string} table
 * @param {string} recordId
 * @returns {Promise<AirtableRecord>}
 */
export function get(table, recordId) {
	return request(`${baseUrl(table)}/${recordId}`, { headers: headers() });
}

/**
 * @param {string} table
 * @param {Record<string, any>} fields
 * @returns {Promise<AirtableRecord>}
 */
export async function create(table, fields) {
	const record = await request(baseUrl(table), {
		method: 'POST',
		headers: headers(),
		body: JSON.stringify({ fields })
	});
	remember(table, new Map([[record.id, record]]));
	return record;
}

/**
 * @param {string} table
 * @param {string} recordId
 * @param {Record<string, any>} fields
 * @returns {Promise<AirtableRecord>}
 */
export async function update(table, recordId, fields) {
	const record = await request(`${baseUrl(table)}/${recordId}`, {
		method: 'PATCH',
		headers: headers(),
		body: JSON.stringify({ fields })
	});
	remember(table, new Map([[record.id, record]]));
	return record;
}

/**
 * Deletes records in batches of 10 — Airtable's max per DELETE request.
 * @param {string} table
 * @param {string[]} recordIds
 */
export async function remove(table, recordIds) {
	for (let i = 0; i < recordIds.length; i += 10) {
		const batch = recordIds.slice(i, i + 10);
		const params = new URLSearchParams();
		batch.forEach((id) => params.append('records[]', id));
		await request(`${baseUrl(table)}?${params}`, { method: 'DELETE', headers: headers() });
		remember(table, new Map(batch.map((id) => [id, null])));
	}
}

/**
 * @param {string} table
 * @param {string} filterByFormula
 * @param {Record<string, any>} fields
 * @returns {Promise<AirtableRecord>}
 */
export async function upsert(table, filterByFormula, fields) {
	const existing = await find(table, filterByFormula);
	if (existing) return update(table, existing.id, fields);
	return create(table, fields);
}
