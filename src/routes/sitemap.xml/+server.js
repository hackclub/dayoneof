import { SITE_URL } from '$lib/site';

const PAGES = ['/', '/home'];

export function GET() {
	const urls = PAGES.map((path) => `<url><loc>${SITE_URL}${path}</loc></url>`).join('');
	const xml = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`;
	return new Response(xml, {
		headers: { 'Content-Type': 'application/xml', 'Cache-Control': 'public, max-age=3600' }
	});
}
