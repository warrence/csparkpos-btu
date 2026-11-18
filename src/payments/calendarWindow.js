import {kuchingDate, applicableDays, holidayDates} from './holidayCalendar';

// Zero in the legacy Realm city schema means no usable configuration, never
// an unlimited window or a substitute for the downloaded policy.
export function configuredCalendarDays(value, label = 'Expiry days') {
  const text = String(value == null ? '' : value).trim();
  const days = /^\d+$/.test(text) ? Number(text) : NaN;
  if (!Number.isSafeInteger(days) || days < 1 || days > 9999)
    throw new Error(`Load valid ${label} from city settings before collecting.`);
  return days;
}

export function cachedCalendarDays(value) {
  try { return configuredCalendarDays(value); } catch (error) { return 0; }
}

export function calendarNoticeDate(value) {
  return kuchingDate(value);
}

export function calendarIsOverdue(value, expiryDays, now = new Date(), holidays = []) {
  return applicableDays(value, now, holidays) > configuredCalendarDays(expiryDays);
}

export function calendarWindowDates(expiryDays, now = new Date(), holidays = []) {
  const days = configuredCalendarDays(expiryDays, 'OPN expiry days');
  const date = calendarNoticeDate(now), excluded = new Set(holidayDates(holidays));
  const dates = [];
  let counted = 0;
  // Return a contiguous range, including holidays on which notices were issued.
  // Leading issue-date holidays have the same age as the next non-holiday.
  while (counted < days || excluded.has(date.format('YYYY-MM-DD'))) {
    dates.push(date.clone());
    if (!excluded.has(date.format('YYYY-MM-DD'))) counted++;
    date.subtract(1, 'days');
  }
  return dates;
}
