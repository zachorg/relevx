/**
 * Scheduling utilities for calculating project execution times
 *
 * Handles timezone conversions, nextRunAt calculations, and validation
 * for user-specified delivery times and frequencies.
 */

import { add, set, isAfter } from "date-fns";
import { toZonedTime, fromZonedTime } from "date-fns-tz";
import type { Frequency } from "../models/project";

/**
 * Validate delivery time format and 15-minute increment
 * @param time - Time string in HH:MM format (24-hour)
 * @returns true if valid, false otherwise
 */
export function validateDeliveryTime(time: string): boolean {
  // Check format HH:MM
  const timeRegex = /^([0-1][0-9]|2[0-3]):([0-5][0-9])$/;
  if (!timeRegex.test(time)) {
    return false;
  }

  // Check 15-minute increment
  const [, minutes] = time.split(":");
  const minutesNum = parseInt(minutes, 10);
  return minutesNum % 15 === 0;
}

/**
 * Validate that a project hasn't run too frequently (max daily)
 * @param frequency - Project frequency
 * @param lastRunAt - Timestamp of last execution
 * @returns true if enough time has passed, false if too soon
 */
export function validateFrequency(
  frequency: Frequency,
  lastRunAt?: number
): boolean {
  if (!lastRunAt) {
    return true; // Never run before, always valid
  }

  const now = Date.now();
  const timeSinceLastRun = now - lastRunAt;
  const oneDayMs = 24 * 60 * 60 * 1000;

  // Prevent running more than once per day (daily is the maximum frequency)
  return timeSinceLastRun >= oneDayMs;
}

/**
 * Calculate the next run timestamp based on frequency, delivery time, and timezone
 * @param frequency - daily, weekly, or monthly
 * @param deliveryTime - HH:MM format in user's timezone
 * @param timezone - IANA timezone identifier (e.g., "America/New_York")
 * @param lastRunAt - Optional timestamp of last execution
 * @returns Timestamp (milliseconds) for next execution
 */
export function calculateNextRunAt(
  frequency: Frequency,
  deliveryTime: string,
  timezone: string,
  lastRunAt?: number
): number {
  // Parse delivery time
  const [hours, minutes] = deliveryTime.split(":").map(Number);

  // Get current time in UTC
  const now = new Date();

  // Convert to user's timezone
  const nowInUserTz = toZonedTime(now, timezone);

  // Set the delivery time for today in user's timezone
  let nextRunInUserTz = set(nowInUserTz, {
    hours,
    minutes,
    seconds: 0,
    milliseconds: 0,
  });

  // If we've already passed the delivery time today, move to the next period
  if (!isAfter(nextRunInUserTz, nowInUserTz)) {
    nextRunInUserTz = addFrequencyPeriod(nextRunInUserTz, frequency);
  }

  // Apply frequency rules - ensure we're in the future
  while (!isAfter(nextRunInUserTz, nowInUserTz)) {
    nextRunInUserTz = addFrequencyPeriod(nextRunInUserTz, frequency);
  }

  // Convert from user's timezone to UTC timestamp
  const nextRunUtc = fromZonedTime(nextRunInUserTz, timezone);
  return nextRunUtc.getTime();
}

/**
 * Add one frequency period to a date
 * @param date - Starting date
 * @param frequency - Period to add
 * @returns New date with period added
 */
function addFrequencyPeriod(date: Date, frequency: Frequency): Date {
  switch (frequency) {
    case "daily":
      return add(date, { days: 1 });
    case "weekly":
      return add(date, { weeks: 1 });
    case "monthly":
      return add(date, { months: 1 });
  }
}

/**
 * Convert a UTC date to a specific timezone
 * @param date - Date in UTC
 * @param timezone - IANA timezone identifier
 * @returns Date object representing the same moment in the target timezone
 */
function convertToTimezone(date: Date, timezone: string): Date {
  return toZonedTime(date, timezone);
}

/**
 * Check if a project is due to run now
 * @param nextRunAt - Scheduled next run timestamp
 * @param gracePeriodMs - Grace period in milliseconds (default: 1 minute)
 * @returns true if project should run now
 */
export function isProjectDue(
  nextRunAt?: number,
  gracePeriodMs: number = 60000
): boolean {
  if (!nextRunAt) {
    return false; // No scheduled time, don't run
  }

  const now = Date.now();
  // Allow a 1-minute grace period in case the cron runs slightly late
  return nextRunAt <= now + gracePeriodMs;
}

/**
 * Generate time options for a time picker (15-minute increments)
 * @returns Array of time strings in HH:MM format
 */
export function formatTimeOptions(): string[] {
  const options: string[] = [];

  for (let hour = 0; hour < 24; hour++) {
    for (let minute = 0; minute < 60; minute += 15) {
      const hourStr = hour.toString().padStart(2, "0");
      const minuteStr = minute.toString().padStart(2, "0");
      options.push(`${hourStr}:${minuteStr}`);
    }
  }

  return options;
}

/**
 * Format a timestamp to a readable string in a specific timezone
 * @param timestamp - Unix timestamp in milliseconds
 * @param timezone - IANA timezone identifier
 * @returns Formatted date string
 */
export function formatTimestampInTimezone(
  timestamp: number,
  timezone: string
): string {
  const utcDate = new Date(timestamp);
  const zonedDate = toZonedTime(utcDate, timezone);

  // Use Intl for formatting (this part is safe and proper for display)
  return zonedDate.toLocaleString("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/**
 * Get a list of common timezones for UI selection
 * @returns Array of timezone objects with label and value
 */
export function getCommonTimezones(): Array<{ label: string; value: string }> {
  return [
    { label: "Pacific Time (US)", value: "America/Los_Angeles" },
    { label: "Mountain Time (US)", value: "America/Denver" },
    { label: "Central Time (US)", value: "America/Chicago" },
    { label: "Eastern Time (US)", value: "America/New_York" },
    { label: "Atlantic Time (Canada)", value: "America/Halifax" },
    { label: "GMT / UTC", value: "UTC" },
    { label: "London", value: "Europe/London" },
    { label: "Paris / Berlin", value: "Europe/Paris" },
    { label: "Moscow", value: "Europe/Moscow" },
    { label: "Dubai", value: "Asia/Dubai" },
    { label: "Mumbai", value: "Asia/Kolkata" },
    { label: "Bangkok", value: "Asia/Bangkok" },
    { label: "Singapore", value: "Asia/Singapore" },
    { label: "Hong Kong", value: "Asia/Hong_Kong" },
    { label: "Tokyo", value: "Asia/Tokyo" },
    { label: "Sydney", value: "Australia/Sydney" },
    { label: "Auckland", value: "Pacific/Auckland" },
  ];
}

/**
 * Detect user's timezone using browser API
 * @returns IANA timezone identifier
 */
export function detectUserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch (error) {
    // Fallback to UTC if detection fails
    return "UTC";
  }
}
