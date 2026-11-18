import moment from 'moment';

// Bintulu civil dates, independent of the device's current timezone. Date-only
// values stay date-only; Realm/JS Date values represent instants.
export function kuchingDate(value) {
  const date = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? moment.utc(value, 'YYYY-MM-DD', true) : (typeof value === 'string' ? moment.parseZone(value, moment.ISO_8601, true) : moment(value)).utcOffset(480);
  if (!value || !date.isValid()) throw new Error('Select a valid notice date.');
  return moment.utc(date.format('YYYY-MM-DD'), 'YYYY-MM-DD', true);
}

export function holidayDates(rows) {
  if (!Array.isArray(rows)) throw new Error('Load a valid holiday calendar from the office.');
  return Array.from(new Set(rows.filter(row => !row.deleted_at).map(row => {
    const value = typeof row === 'string' ? row : row.HolidayDate || row.holidayDate;
    return kuchingDate(value).format('YYYY-MM-DD');
  }))).sort();
}

export function readHolidayCalendar(database) {
  const saved = database.objects('HolidayCalendar')[0];
  if (!saved) {
    // Preserve a populated pre-upgrade Realm cache while offline. Its age is
    // unknown, rather than assumed fresh or rejected by an invented limit.
    const legacy = Array.from(database.objects('Holiday'));
    if (!legacy.length) throw new Error('Load holidays from the office before collecting.');
    return {dates: holidayDates(legacy), loadedAt: null, revision: null, serverGeneratedAt: null, legacy: true};
  }
  const dates = holidayDates(JSON.parse(saved.json));
  if (!saved.loadedAt || !Number.isFinite(new Date(saved.loadedAt).getTime()))
    throw new Error('Load holidays from the office before collecting.');
  return {dates, loadedAt: saved.loadedAt, revision: saved.revision || null, serverGeneratedAt: saved.serverGeneratedAt || null};
}

// Inclusive expiry age: issue day is day 1 unless it is a configured holiday.
// Production expiry and discounts include both ends. Every configured holiday,
// including a defensive holiday issue date, contributes zero applicable days.
export function applicableDays(issuedAt, collectedAt, dates, includeIssue = true) {
  const issued = kuchingDate(issuedAt), collected = kuchingDate(collectedAt);
  if (issued.isAfter(collected, 'day')) throw new Error('Notice date cannot be in the future.');
  const holidays = new Set(holidayDates(dates));
  let count = 0;
  for (const day = issued.clone().add(includeIssue ? 0 : 1, 'days'); !day.isAfter(collected); day.add(1, 'days'))
    if (!holidays.has(day.format('YYYY-MM-DD'))) count++;
  return count;
}

export function holidayCalendarLabel(database) {
  try {
    const calendar = readHolidayCalendar(database);
    if (calendar.legacy) return 'Holiday calendar cached; download time unknown. Refresh when online.';
    const date = calendar.loadedAt;
    return `Last holiday download: ${moment(date).utcOffset(480).format('DD MMM YYYY, HH:mm')} (+08)`;
  } catch (error) { return 'No usable holiday download. Load holidays before collecting.'; }
}
