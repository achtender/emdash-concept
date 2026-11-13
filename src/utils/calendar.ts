/**
 * Calendar helpers for the public `/calendar` month grid.
 *
 * The grid is Monday-first and always renders complete weeks, so the first and
 * last rows can show days from the neighbouring months.
 */

export interface MonthRef {
	year: number;
	/** Zero-based month, matching `Date#getMonth`. */
	month: number;
}

const MONTH_PATTERN = /^(\d{4})-(\d{2})$/;

/** Parse a `YYYY-MM` query value. Invalid input falls back to today. */
export function parseMonth(value: string | null | undefined, now = new Date()): MonthRef {
	const match = value ? MONTH_PATTERN.exec(value) : null;
	if (!match) return { year: now.getFullYear(), month: now.getMonth() };

	const year = Number(match[1]);
	const month = Number(match[2]) - 1;
	if (month < 0 || month > 11 || year < 1970 || year > 2999) {
		return { year: now.getFullYear(), month: now.getMonth() };
	}
	return { year, month };
}

/** `YYYY-MM` key for links and query params. */
export function monthKey({ year, month }: MonthRef): string {
	return `${year}-${String(month + 1).padStart(2, "0")}`;
}

/** `YYYY-MM-DD` key for a Date, in local time. */
export function dateKey(date: Date): string {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, "0");
	const day = String(date.getDate()).padStart(2, "0");
	return `${year}-${month}-${day}`;
}

export function addMonths({ year, month }: MonthRef, delta: number): MonthRef {
	const date = new Date(year, month + delta, 1);
	return { year: date.getFullYear(), month: date.getMonth() };
}

export function monthStart({ year, month }: MonthRef): Date {
	return new Date(year, month, 1);
}

export function monthEnd({ year, month }: MonthRef): Date {
	return new Date(year, month + 1, 0);
}

export interface CalendarDay {
	date: Date;
	key: string;
	/** False for days that belong to the previous or next month. */
	inMonth: boolean;
	isToday: boolean;
}

/**
 * Complete weeks covering the month, Monday-first. A month needs between four
 * and six rows; the caller decides how to style the overflow days.
 */
export function buildMonthGrid(
	{ year, month }: MonthRef,
	now = new Date(),
): CalendarDay[][] {
	const first = new Date(year, month, 1);
	const last = new Date(year, month + 1, 0);

	// `getDay()` is Sunday-first; shift so Monday becomes 0.
	const leading = (first.getDay() + 6) % 7;
	const gridStart = new Date(year, month, 1 - leading);

	const trailing = 6 - ((last.getDay() + 6) % 7);
	const gridEnd = new Date(year, month + 1, trailing);

	const todayKey = dateKey(now);
	const days: CalendarDay[] = [];
	for (
		let cursor = new Date(gridStart);
		cursor <= gridEnd;
		cursor.setDate(cursor.getDate() + 1)
	) {
		const key = dateKey(cursor);
		days.push({
			date: new Date(cursor),
			key,
			inMonth: cursor.getMonth() === month,
			isToday: key === todayKey,
		});
	}

	const weeks: CalendarDay[][] = [];
	for (let index = 0; index < days.length; index += 7) {
		weeks.push(days.slice(index, index + 7));
	}
	return weeks;
}

/** Monday-first weekday labels for the grid header. */
export const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

/** True when an event's inclusive date range covers the given day key. */
export function eventCoversDay(
	start: string,
	end: string | null | undefined,
	dayKey: string,
): boolean {
	if (!start) return false;
	const last = end && end >= start ? end : start;
	return dayKey >= start && dayKey <= last;
}
