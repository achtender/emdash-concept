import type { APIRoute } from "astro";
import { getEmDashEntry, decodeSlug } from "emdash";

/** Escape a value for an iCalendar text field (RFC 5545 §3.3.11). */
function escapeText(value: string): string {
	return value
		.replace(/\\/g, "\\\\")
		.replace(/\r?\n/g, "\\n")
		.replace(/;/g, "\\;")
		.replace(/,/g, "\\,");
}

/** Fold long content lines at 75 octets, per RFC 5545 §3.1. */
function foldLine(line: string): string {
	const bytes = new TextEncoder().encode(line);
	if (bytes.length <= 75) return line;

	const chunks: string[] = [];
	let current = "";
	let currentBytes = 0;
	for (const char of line) {
		const charBytes = new TextEncoder().encode(char).length;
		if (currentBytes + charBytes > 74 && current.length > 0) {
			chunks.push(current);
			current = "";
			currentBytes = 0;
		}
		current += char;
		currentBytes += charBytes;
	}
	if (current) chunks.push(current);
	return chunks.join("\r\n ");
}

function dateParts(value: string | Date | null | undefined): { date: string; time: string } | null {
	if (!value) return null;
	const iso = typeof value === "string" ? value : value.toISOString();
	const match = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(iso);
	if (!match) return null;
	return {
		date: `${match[1]}${match[2]}${match[3]}`,
		time: `${match[4] ?? "00"}${match[5] ?? "00"}00`,
	};
}

function nextDay(date: string): string {
	const year = Number(date.slice(0, 4));
	const month = Number(date.slice(4, 6)) - 1;
	const day = Number(date.slice(6, 8));
	const value = new Date(Date.UTC(year, month, day + 1));
	return value.toISOString().slice(0, 10).replace(/-/g, "");
}

export const GET: APIRoute = async ({ params, url }) => {
	const slug = decodeSlug(params.slug);
	if (!slug) return new Response("Not found", { status: 404 });

	const { entry: event } = await getEmDashEntry("events", slug);
	if (!event) return new Response("Not found", { status: 404 });

	const start = dateParts(event.data.start);
	if (!start) return new Response("Event has no date", { status: 422 });

	const end = dateParts(event.data.end ?? event.data.start) ?? start;
	const startTime = /^(\d{1,2}):(\d{2})/.exec(event.data.start_time ?? "");
	const endTime = /^(\d{1,2}):(\d{2})/.exec(event.data.end_time ?? "");

	let dtstart: string;
	let dtend: string;

	if (event.data.all_day) {
		dtstart = `DTSTART;VALUE=DATE:${start.date}`;
		dtend = `DTEND;VALUE=DATE:${nextDay(end.date)}`;
	} else {
		const startClock = startTime
			? `${startTime[1].padStart(2, "0")}${startTime[2]}00`
			: "090000";
		const endClock = endTime ? `${endTime[1].padStart(2, "0")}${endTime[2]}00` : "110000";
		dtstart = `DTSTART:${start.date}T${startClock}`;
		dtend = `DTEND:${end.date}T${endClock}`;
	}

	const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
	const pageUrl = `${url.origin}/events/${event.id}`;
	const description = [event.data.summary, event.data.location]
		.filter(Boolean)
		.join("\n\n");

	const lines = [
		"BEGIN:VCALENDAR",
		"VERSION:2.0",
		"PRODID:-//Fieldwork//Events//EN",
		"CALSCALE:GREGORIAN",
		"METHOD:PUBLISH",
		"BEGIN:VEVENT",
		`UID:${event.id}@fieldwork.studio`,
		`DTSTAMP:${stamp}`,
		dtstart,
		dtend,
		`SUMMARY:${escapeText(event.data.title)}`,
		...(description ? [`DESCRIPTION:${escapeText(description)}`] : []),
		...(event.data.location ? [`LOCATION:${escapeText(event.data.location)}`] : []),
		`URL:${pageUrl}`,
		"END:VEVENT",
		"END:VCALENDAR",
	];

	return new Response(lines.map(foldLine).join("\r\n") + "\r\n", {
		headers: {
			"Content-Type": "text/calendar; charset=utf-8",
			"Content-Disposition": `attachment; filename="${event.id}.ics"`,
			"Cache-Control": "public, max-age=300",
		},
	});
};
