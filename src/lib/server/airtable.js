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
/** @type {Map<string, { expires: number, records: Promise<AirtableRecord[]> }>} */
const cache = new Map();

/** @param {string} table */
function forget(table) {
	for (const key of cache.keys()) {
		if (key.startsWith(`${table}:`)) cache.delete(key);
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

// For the public pages: every visitor inside the window shares one fetch, and any write to the
// table drops it so a new post shows up on the next load.
/**
 * @param {string} table
 * @param {{ filterByFormula?: string, sort?: SortRule[] }} [options]
 * @returns {Promise<AirtableRecord[]>}
 */
export function listCached(table, options = {}) {
	const key = `${table}:${JSON.stringify(options)}`;
	const hit = cache.get(key);
	if (hit && hit.expires > Date.now()) return hit.records;
	const records = list(table, options);
	cache.set(key, { expires: Date.now() + CACHE_TTL_MS, records });
	records.catch(() => cache.delete(key));
	return records;
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
export function create(table, fields) {
	forget(table);
	return request(baseUrl(table), {
		method: 'POST',
		headers: headers(),
		body: JSON.stringify({ fields })
	});
}

/**
 * @param {string} table
 * @param {string} recordId
 * @param {Record<string, any>} fields
 * @returns {Promise<AirtableRecord>}
 */
export function update(table, recordId, fields) {
	forget(table);
	return request(`${baseUrl(table)}/${recordId}`, {
		method: 'PATCH',
		headers: headers(),
		body: JSON.stringify({ fields })
	});
}

/**
 * Deletes records in batches of 10 — Airtable's max per DELETE request.
 * @param {string} table
 * @param {string[]} recordIds
 */
export async function remove(table, recordIds) {
	forget(table);
	for (let i = 0; i < recordIds.length; i += 10) {
		const batch = recordIds.slice(i, i + 10);
		const params = new URLSearchParams();
		batch.forEach((id) => params.append('records[]', id));
		await request(`${baseUrl(table)}?${params}`, { method: 'DELETE', headers: headers() });
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
