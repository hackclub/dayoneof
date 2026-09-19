import { config } from './config.js';

/** @typedef {{ id: string, fields: Record<string, any> }} AirtableRecord */
/** @typedef {{ field: string, direction?: 'asc' | 'desc' }} SortRule */

/** @param {string} table */
function baseUrl(table) {
	return `https://api.airtable.com/v0/${config.airtableBaseId}/${encodeURIComponent(table)}`;
}

function headers() {
	return {
		Authorization: `Bearer ${config.airtableToken}`,
		'Content-Type': 'application/json'
	};
}

/**
 * @param {string} url
 * @param {RequestInit} init
 */
async function request(url, init) {
	// prints below are tagged [EXTCALL] — grep for that tag to strip them before shipping
	console.log('[EXTCALL] airtable', init?.method ?? 'GET', url);
	const res = await fetch(url, init);
	if (!res.ok) {
		const body = await res.text();
		throw new Error(`airtable ${init?.method ?? 'GET'} ${url} failed: ${res.status} ${body}`);
	}
	return res.json();
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
 * @param {{ filterByFormula?: string, sort?: SortRule[], pageSize?: number }} [options]
 * @returns {Promise<AirtableRecord[]>}
 */
export async function list(table, { filterByFormula, sort, pageSize } = {}) {
	const records = [];
	let offset;
	do {
		const params = new URLSearchParams();
		if (filterByFormula) params.set('filterByFormula', filterByFormula);
		if (pageSize) params.set('pageSize', String(pageSize));
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

/**
 * @param {string} table
 * @param {Record<string, any>} fields
 * @returns {Promise<AirtableRecord>}
 */
export async function create(table, fields) {
	const data = await request(baseUrl(table), {
		method: 'POST',
		headers: headers(),
		body: JSON.stringify({ fields })
	});
	return data;
}

/**
 * @param {string} table
 * @param {string} recordId
 * @param {Record<string, any>} fields
 * @returns {Promise<AirtableRecord>}
 */
export async function update(table, recordId, fields) {
	const data = await request(`${baseUrl(table)}/${recordId}`, {
		method: 'PATCH',
		headers: headers(),
		body: JSON.stringify({ fields })
	});
	return data;
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
