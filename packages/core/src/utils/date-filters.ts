/**
 * Date filtering utilities
 *
 * Functions for calculating date ranges, formatting dates for queries,
 * and working with project schedules.
 */

import type {
  Frequency,
  DateRangePreference,
} from "../models/project";

/**
 * Date range type
 */
export interface DateRange {
  from: Date;
  to: Date;
  fromISO: string; // ISO date string (YYYY-MM-DD)
  toISO: string; // ISO date string (YYYY-MM-DD)
}

/**
 * Calculate date range from a duration
 */
export function calculateDateRange(
  durationDays: number,
  endDate?: Date
): DateRange {
  const to = endDate || new Date();
  const from = new Date(to.getTime() - durationDays * 24 * 60 * 60 * 1000);

  return {
    from,
    to,
    fromISO: from.toISOString().split("T")[0],
    toISO: to.toISOString().split("T")[0],
  };
}

/**
 * Calculate date range based on project frequency
 */
export function calculateDateRangeByFrequency(
  frequency: Frequency,
  endDate?: Date
): DateRange {
  switch (frequency) {
    case "daily":
      return calculateDateRange(1, endDate);
    case "weekly":
      return calculateDateRange(7, endDate);
    case "monthly":
      return calculateDateRange(30, endDate);
  }
}

/**
 * Calculate date range based on preference
 */
export function calculateDateRangeByPreference(
  preference: DateRangePreference,
  endDate?: Date
): DateRange {
  switch (preference) {
    case "last_24h":
      return calculateDateRange(1, endDate);
    case "last_week":
      return calculateDateRange(7, endDate);
    case "last_month":
      return calculateDateRange(30, endDate);
    case "last_3months":
      return calculateDateRange(90, endDate);
    case "last_year":
      return calculateDateRange(365, endDate);
    case "custom":
      // For custom, return last week as default
      return calculateDateRange(7, endDate);
  }
}

/**
 * Calculate next run time based on frequency
 */
export function calculateNextRunTime(
  frequency: Frequency,
  lastRunAt?: number
): number {
  const baseDate = lastRunAt ? new Date(lastRunAt) : new Date();

  switch (frequency) {
    case "daily":
      // Next day at 8 AM UTC
      const nextDay = new Date(baseDate);
      nextDay.setUTCDate(nextDay.getUTCDate() + 1);
      nextDay.setUTCHours(8, 0, 0, 0);
      return nextDay.getTime();

    case "weekly":
      // Next Monday at 8 AM UTC
      const nextWeek = new Date(baseDate);
      const daysUntilMonday = (8 - nextWeek.getUTCDay()) % 7 || 7;
      nextWeek.setUTCDate(nextWeek.getUTCDate() + daysUntilMonday);
      nextWeek.setUTCHours(8, 0, 0, 0);
      return nextWeek.getTime();

    case "monthly":
      // 1st of next month at 8 AM UTC
      const nextMonth = new Date(baseDate);
      nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
      nextMonth.setUTCDate(1);
      nextMonth.setUTCHours(8, 0, 0, 0);
      return nextMonth.getTime();
  }
}

/**
 * Check if a project is due for execution
 */
export function isProjectDue(
  nextRunAt: number | undefined,
  now?: number
): boolean {
  if (!nextRunAt) return false;
  
  const currentTime = now || Date.now();
  return nextRunAt <= currentTime;
}

/**
 * Format date for search query
 * Returns natural language date reference
 */
export function formatDateForQuery(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return "today";
  } else if (diffDays === 1) {
    return "yesterday";
  } else if (diffDays <= 7) {
    return "this week";
  } else if (diffDays <= 30) {
    return "this month";
  } else if (diffDays <= 90) {
    return "last 3 months";
  } else if (diffDays <= 365) {
    return "this year";
  } else {
    return date.getFullYear().toString();
  }
}

/**
 * Get relative time description
 */
export function getRelativeTimeDescription(timestamp: number): string {
  const now = Date.now();
  const diffMs = now - timestamp;
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSeconds < 60) {
    return "just now";
  } else if (diffMinutes < 60) {
    return `${diffMinutes} minute${diffMinutes !== 1 ? "s" : ""} ago`;
  } else if (diffHours < 24) {
    return `${diffHours} hour${diffHours !== 1 ? "s" : ""} ago`;
  } else if (diffDays < 7) {
    return `${diffDays} day${diffDays !== 1 ? "s" : ""} ago`;
  } else if (diffDays < 30) {
    const weeks = Math.floor(diffDays / 7);
    return `${weeks} week${weeks !== 1 ? "s" : ""} ago`;
  } else if (diffDays < 365) {
    const months = Math.floor(diffDays / 30);
    return `${months} month${months !== 1 ? "s" : ""} ago`;
  } else {
    const years = Math.floor(diffDays / 365);
    return `${years} year${years !== 1 ? "s" : ""} ago`;
  }
}

/**
 * Parse published date from various formats
 */
export function parsePublishedDate(dateString?: string): Date | undefined {
  if (!dateString) return undefined;

  try {
    // Try ISO format first
    const parsed = new Date(dateString);
    if (!isNaN(parsed.getTime())) {
      return parsed;
    }

    // Try common formats
    const formats = [
      // ISO variants
      /^\d{4}-\d{2}-\d{2}$/,
      /^\d{4}\/\d{2}\/\d{2}$/,
      // Month day, year
      /^[A-Za-z]+ \d{1,2}, \d{4}$/,
      // Day month year
      /^\d{1,2} [A-Za-z]+ \d{4}$/,
    ];

    for (const format of formats) {
      if (format.test(dateString)) {
        const date = new Date(dateString);
        if (!isNaN(date.getTime())) {
          return date;
        }
      }
    }

    return undefined;
  } catch (error) {
    return undefined;
  }
}

/**
 * Check if a date is within a range
 */
export function isDateInRange(
  date: Date | string,
  range: DateRange
): boolean {
  const dateObj = typeof date === "string" ? new Date(date) : date;
  
  if (isNaN(dateObj.getTime())) {
    return false;
  }

  return dateObj >= range.from && dateObj <= range.to;
}

/**
 * Get temporal keywords for search queries based on frequency
 */
export function getTemporalKeywords(frequency: Frequency): string[] {
  switch (frequency) {
    case "daily":
      return ["today", "latest", "breaking", "recent", "new"];
    case "weekly":
      return ["this week", "recent", "latest", "new", "current"];
    case "monthly":
      return ["this month", "recent", "latest", "new", "2024"];
  }
}

/**
 * Format date range for display
 */
export function formatDateRangeDisplay(range: DateRange): string {
  const options: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    year: "numeric",
  };

  const fromStr = range.from.toLocaleDateString("en-US", options);
  const toStr = range.to.toLocaleDateString("en-US", options);

  return `${fromStr} - ${toStr}`;
}

/**
 * Get timestamp for start of day (UTC)
 */
export function getStartOfDay(date?: Date): number {
  const d = date || new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * Get timestamp for end of day (UTC)
 */
export function getEndOfDay(date?: Date): number {
  const d = date || new Date();
  d.setUTCHours(23, 59, 59, 999);
  return d.getTime();
}

/**
 * Check if timestamp is older than duration
 */
export function isOlderThan(
  timestamp: number,
  durationDays: number
): boolean {
  const now = Date.now();
  const diffMs = now - timestamp;
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  return diffDays > durationDays;
}

