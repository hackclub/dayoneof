// Replaces every row in the dev tables with a copy of the matching prod table, so local testing
// runs against real data. Only ever writes to the `_dev` tables; prod is read, never written.
// The dev rows it wipes are saved to backups/ first. Record ids that rows point at (another
// platform's primary submission, the days in a deleted post's saved state) are remapped.
//
//   node --env-file=.env scripts/mirror_dev.js

import { mkdirSync, writeFileSync } from 'node:fs';
import { tablesFor, shippingTableFor, F } from '../src/lib/server/schema.js';

const API = 'https://api.airtable.com/v0';
const META = `${API}/meta/bases`;
// Airtable computes these itself and rejects writes to them.
const COMPUTED = new Set([
	'autoNumber',
	'formula',
	'rollup',
	'count',
	'lookup',
	'multipleLookupValues',
	'createdTime',
	'lastModifiedTime',
	'createdBy',
	'lastModifiedBy',
	'button'
]);

/** @param {string} name */
function envVar(name) {
	const value = process.env[`${name}_DEV`] || process.env[name];
	if (!value) throw new Error(`missing required env var: ${name}`);
	return value;
}

const token = envVar('AIRTABLE_TOKEN');
const baseId = envVar('AIRTABLE_BASE_ID');

/**
 * @param {string} url
 * @param {RequestInit} [init]
 */
async function api(url, init) {
	await new Promise((resolve) => setTimeout(resolve, 220));
	const res = await fetch(url, {
		...init,
		headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
	});
	const body = await res.text();
	if (!res.ok) throw new Error(`airtable ${init?.method ?? 'GET'} ${url} failed: ${res.status} ${body}`);
	return body ? JSON.parse(body) : {};
}

/** @param {string} table */
const tableUrl = (table) => `${API}/${baseId}/${encodeURIComponent(table)}`;

/**
 * @param {string} table
 * @returns {Promise<{ id: string, fields: Record<string, any> }[]>}
 */
async function list(table) {
	const records = [];
	let offset;
	do {
		const params = new URLSearchParams({ pageSize: '100' });
		if (offset) params.set('offset', offset);
		const page = await api(`${tableUrl(table)}?${params}`);
		records.push(...page.records);
		offset = page.offset;
	} while (offset);
	return records;
}

/**
 * @param {string} table
 * @param {Record<string, any>[]} rows
 * @returns {Promise<{ id: string }[]>}
 */
async function create(table, rows) {
	const created = [];
	for (let i = 0; i < rows.length; i += 10) {
		const { records } = await api(tableUrl(table), {
			method: 'POST',
			body: JSON.stringify({ records: rows.slice(i, i + 10).map((fields) => ({ fields })), typecast: true })
		});
		created.push(...records);
	}
	return created;
}

/**
 * @param {string} table
 * @param {string[]} ids
 */
async function remove(table, ids) {
	for (let i = 0; i < ids.length; i += 10) {
		const params = new URLSearchParams();
		for (const id of ids.slice(i, i + 10)) params.append('records[]', id);
		await api(`${tableUrl(table)}?${params}`, { method: 'DELETE' });
	}
}

async function main() {
	const prod = tablesFor('prod');
	const dev = tablesFor('dev');
	const pairs = [
		[prod.participants, dev.participants],
		[prod.days, dev.days],
		[shippingTableFor('prod'), shippingTableFor('dev')],
		[prod.submissions, dev.submissions]
	];
	if (pairs.some(([from, to]) => from === to)) throw new Error('dev and prod table names collide');

	const { tables } = await api(`${META}/${baseId}/tables`);
	/** @param {string} name */
	const writable = (name) => {
		const table = tables.find((/** @type {{ name: string }} */ t) => t.name === name);
		if (!table) throw new Error(`table ${name} not found — run npm run setup:airtable first`);
		return new Set(
			table.fields
				.filter((/** @type {{ type: string }} */ f) => !COMPUTED.has(f.type))
				.map((/** @type {{ name: string }} */ f) => f.name)
		);
	};

	/** @type {Record<string, any[]>} */
	const backup = {};
	for (const [, to] of pairs) backup[to] = await list(to);
	mkdirSync('backups', { recursive: true });
	const stamp = new Date().toISOString().slice(2, 16).replace('T', '_').replace(':', '');
	const backupPath = `backups/dev_tables_${stamp}.json`;
	writeFileSync(backupPath, JSON.stringify(backup));
	console.log(`saved current dev rows to ${backupPath}`);

	for (const [, to] of pairs) {
		await remove(to, backup[to].map((r) => r.id));
		console.log(`  cleared ${backup[to].length} rows from ${to}`);
	}

	/** @type {Map<string, string>} */
	const idMap = new Map();
	const idPattern = /\brec[A-Za-z0-9]{14}\b/g;
	/** @param {any} value */
	const remap = (value) =>
		typeof value === 'string' ? value.replace(idPattern, (id) => idMap.get(id) ?? id) : value;

	for (const [from, to] of pairs) {
		const fields = writable(to);
		const rows = await list(from);
		/** @param {typeof rows} batch */
		const copy = async (batch) => {
			const created = await create(
				to,
				batch.map((r) =>
					Object.fromEntries(
						Object.entries(r.fields)
							.filter(([name]) => fields.has(name))
							.map(([name, value]) => [name, remap(value)])
					)
				)
			);
			batch.forEach((r, i) => idMap.set(r.id, created[i].id));
		};
		// Primaries first, so the other-platform rows pointing at them get the new ids.
		const isAlternate = (/** @type {(typeof rows)[number]} */ r) =>
			to === dev.submissions && !!r.fields[F.submissions.primarySubmission];
		await copy(rows.filter((r) => !isAlternate(r)));
		await copy(rows.filter(isAlternate));
		console.log(`  copied ${rows.length} rows ${from} -> ${to}`);
	}
	console.log('done');
}

main().catch((err) => {
	console.error(err instanceof Error ? err.message : String(err));
	process.exitCode = 1;
});
