import type { APIRoute } from "astro";
import { getEmDashCollection, getSiteSettings } from "emdash";
import { resolveStarterSiteIdentity } from "../utils/site-identity";

function escapeXml(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&apos;");
}

function toRfc822(value: string | Date | null | undefined): string | null {
	if (!value) return null;
	const date = value instanceof Date ? value : new Date(value);
	return Number.isNaN(date.getTime()) ? null : date.toUTCString();
}

export const GET: APIRoute = async ({ url }) => {
	const [{ entries: posts }, settings] = await Promise.all([
		getEmDashCollection("posts", { orderBy: { date: "desc" }, limit: 20 }),
		getSiteSettings(),
	]);

	const { siteTitle, siteTagline } = resolveStarterSiteIdentity(settings);
	const origin = url.origin;

	const items = posts
		.map((post) => {
			const link = `${origin}/journal/${post.id}`;
			const published = toRfc822(post.data.date ?? post.data.publishedAt);
			const description = post.data.excerpt ?? "";

			return [
				"<item>",
				`<title>${escapeXml(post.data.title)}</title>`,
				`<link>${escapeXml(link)}</link>`,
				`<guid isPermaLink="true">${escapeXml(link)}</guid>`,
				published ? `<pubDate>${published}</pubDate>` : "",
				`<description>${escapeXml(description)}</description>`,
				"</item>",
			]
				.filter(Boolean)
				.join("");
		})
		.join("");

	const lastBuild = toRfc822(posts[0]?.data.date ?? new Date());

	const xml = [
		'<?xml version="1.0" encoding="UTF-8"?>',
		'<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
		"<channel>",
		`<title>${escapeXml(siteTitle)}</title>`,
		`<link>${escapeXml(origin)}</link>`,
		`<description>${escapeXml(siteTagline)}</description>`,
		`<language>en</language>`,
		lastBuild ? `<lastBuildDate>${lastBuild}</lastBuildDate>` : "",
		`<atom:link href="${escapeXml(`${origin}/rss.xml`)}" rel="self" type="application/rss+xml" />`,
		items,
		"</channel>",
		"</rss>",
	]
		.filter(Boolean)
		.join("\n");

	return new Response(xml, {
		headers: {
			"Content-Type": "application/rss+xml; charset=utf-8",
			"Cache-Control": "public, max-age=300",
		},
	});
};
