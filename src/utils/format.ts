/**
 * Formatting helpers shared by pages and components.
 *
 * Dates arrive from EmDash as `Date` objects for built-in columns and as
 * `YYYY-MM-DD` strings for the custom `date` / `start` fields used by this
 * site. Both are normalized here so templates never format dates inline.
 */

export type DateInput = Date | string | null | undefined;

const DEFAULT_LOCALE = "en-US";

function toDate(value: DateInput): Date | null {
	if (!value) return null;
	if (value instanceof Date) {
		return Number.isNaN(value.getTime()) ? null : value;
	}

	// A bare `YYYY-MM-DD` is parsed as UTC midnight. Read the parts directly so
	// the displayed day never shifts with the viewer's timezone.
	const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
	if (dateOnly) {
		const [, year, month, day] = dateOnly;
		return new Date(Number(year), Number(month) - 1, Number(day));
	}

	const parsed = new Date(value);
	return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** "May 2, 2026" */
export function formatDate(value: DateInput, locale = DEFAULT_LOCALE): string {
	const date = toDate(value);
	if (!date) return "";
	return new Intl.DateTimeFormat(locale, {
		year: "numeric",
		month: "short",
		day: "numeric",
	}).format(date);
}

/** "May 2, 2026" spelled out — used where there is room. */
export function formatDateLong(value: DateInput, locale = DEFAULT_LOCALE): string {
	const date = toDate(value);
	if (!date) return "";
	return new Intl.DateTimeFormat(locale, {
		year: "numeric",
		month: "long",
		day: "numeric",
	}).format(date);
}

/** "2 May" — compact, for calendar and list meta. */
export function formatDayMonth(value: DateInput, locale = DEFAULT_LOCALE): string {
	const date = toDate(value);
	if (!date) return "";
	return new Intl.DateTimeFormat(locale, {
		month: "short",
		day: "numeric",
	}).format(date);
}

/** "14:30" in 24-hour time. */
export function formatTime(value: string | null | undefined): string {
	if (!value) return "";
	const match = /^(\d{1,2}):(\d{2})/.exec(value);
	if (!match) return value;
	const [, hours, minutes] = match;
	return `${hours.padStart(2, "0")}:${minutes}`;
}

/** "May 2026" from a `YYYY-MM` string or a Date. */
export function formatMonthLabel(value: DateInput, locale = DEFAULT_LOCALE): string {
	const date = toDate(value);
	if (!date) return "";
	return new Intl.DateTimeFormat(locale, {
		year: "numeric",
		month: "long",
	}).format(date);
}

/**
 * "May 2–4, 2026" for multi-day events, collapsing shared parts. Falls back to
 * a single formatted date when start and end match.
 */
export function formatDateRange(
	start: DateInput,
	end: DateInput,
	locale = DEFAULT_LOCALE,
): string {
	const startDate = toDate(start);
	const endDate = toDate(end);
	if (!startDate) return "";
	if (!endDate) return formatDate(startDate, locale);

	const sameDay =
		startDate.getFullYear() === endDate.getFullYear() &&
		startDate.getMonth() === endDate.getMonth() &&
		startDate.getDate() === endDate.getDate();
	if (sameDay) return formatDate(startDate, locale);

	const sameMonth =
		startDate.getFullYear() === endDate.getFullYear() &&
		startDate.getMonth() === endDate.getMonth();

	if (sameMonth) {
		const month = new Intl.DateTimeFormat(locale, { month: "long" }).format(startDate);
		return `${month} ${startDate.getDate()}–${endDate.getDate()}, ${endDate.getFullYear()}`;
	}

	return `${formatDate(startDate, locale)} – ${formatDate(endDate, locale)}`;
}

/** ISO date for `<time datetime>` attributes. */
export function isoDate(value: DateInput): string | undefined {
	const date = toDate(value);
	return date ? date.toISOString().slice(0, 10) : undefined;
}

interface TextSpan {
	text?: string;
}

function isTextSpan(value: unknown): value is TextSpan {
	return typeof value === "object" && value !== null && "text" in value;
}

interface TextBlock {
	_type?: string;
	style?: string;
	children?: readonly unknown[];
}

function blockText(block: { children?: readonly unknown[] }): string {
	if (!Array.isArray(block.children)) return "";
	return block.children
		.map((child) => (isTextSpan(child) ? child.text ?? "" : ""))
		.join("");
}

/** Flatten Portable Text into a single plain-text string. */
export function plainText(blocks: readonly TextBlock[] | null | undefined): string {
	if (!Array.isArray(blocks)) return "";
	return blocks
		.filter((block) => block._type === "block")
		.map(blockText)
		.filter(Boolean)
		.join("\n\n")
		.trim();
}

/** Estimated reading time in minutes, at ~220 words per minute. */
export function readingTime(blocks: readonly TextBlock[] | null | undefined): number {
	const words = plainText(blocks).split(/\s+/).filter(Boolean).length;
	return Math.max(1, Math.round(words / 220));
}

export interface Heading {
	id: string;
	text: string;
	level: 2 | 3 | 4;
}

/** Lowercase, hyphenated, ASCII-only slug. */
export function slugify(input: string): string {
	return input
		.normalize("NFKD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 80);
}

/**
 * Anchor id for a Portable Text heading. Prefers the block `_key` so the TOC
 * and the renderer agree even when two headings share text; falls back to a
 * slug of the text for imported content without keys.
 */
export function headingId(block: {
	_key?: string;
	children?: readonly unknown[];
}): string {
	if (block._key) return `h-${block._key}`;
	return slugify(blockText(block)) || "section";
}

/** Collect h2–h4 headings from Portable Text, for a table of contents. */
export function getHeadings(blocks: readonly (TextBlock & { _key?: string })[] | null | undefined): Heading[] {
	if (!Array.isArray(blocks)) return [];

	return blocks.flatMap((block) => {
		if (block._type !== "block") return [];
		const style = block.style ?? "normal";
		const level = style === "h2" ? 2 : style === "h3" ? 3 : style === "h4" ? 4 : null;
		if (!level) return [];
		const text = blockText(block).trim();
		if (!text) return [];
		return [{ id: headingId(block), text, level }];
	});
}

/**
 * Stable hue for generated cover art, derived from a string. Keeps a title's
 * artwork consistent between the index and detail pages.
 */
export function hueFrom(seed: string): number {
	let hash = 0;
	for (let index = 0; index < seed.length; index += 1) {
		hash = (hash * 31 + seed.charCodeAt(index)) % 360;
	}
	return hash;
}
