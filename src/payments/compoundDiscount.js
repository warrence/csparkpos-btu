import {calendarNoticeDate} from './calendarWindow';
import {applicableDays} from './holidayCalendar';

// Count the issue date as day 1; keep configured rates and tier-2 precedence. Only an unused zero-day/zero-percent secondary
// tier is disabled, matching the API even when a configured tier has 0% discount.
export function compoundDiscountPercent(offence, issuedAt, collectedAt = new Date(), holidays = []) {
  const issued = calendarNoticeDate(issuedAt);
  const collected = calendarNoticeDate(collectedAt);
  if (issued.isAfter(collected, 'day')) throw new Error('Compound date cannot be in the future.');
  const tiers = offence && [
    {days: offence.dayPay2, percent: offence.disPercent2},
    {days: offence.dayPay, percent: offence.disPercent},
  ];
  if (!tiers || tiers.some(tier => !Number.isSafeInteger(tier.days) || tier.days < 0 ||
      typeof tier.percent !== 'number' || !Number.isFinite(tier.percent) || tier.percent < 0 || tier.percent > 100))
    throw new Error('Load valid compound discount settings from the office.');
  const age = applicableDays(issuedAt, collectedAt, holidays);
  const eligible = tiers.find((tier, index) => (index !== 0 || tier.days > 0 || tier.percent > 0) && age <= tier.days);
  return eligible ? eligible.percent : 0;
}
