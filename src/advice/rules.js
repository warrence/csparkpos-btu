import {calendarIsOverdue} from '../payments/calendarWindow';
import {cents, validateFixedAdvicePolicy} from './collection';

export function validateAdviceRules(response) {
  const rules = response && response.rules;
  if (!response || response.protocolVersion !== 1 || response.configured !== true || !rules ||
      !Number.isSafeInteger(rules.calendarDays) || rules.calendarDays <= 0 ||
      typeof rules.taxEnabled !== 'boolean' || rules.windowIncludesCollectionDate !== true ||
      rules.rounding !== 'nearest_0.05_on_notice_net_and_tax') {
    throw new Error('Load configured Advice Notice rules at the office before collecting.');
  }
  if (cents(rules.overdueFee, 'Advice overdue fee') > 999999) throw new Error('Advice overdue fee exceeds the supported amount.');
  if (rules.collectionPolicyVersion !== undefined) validateFixedAdvicePolicy(rules);
  return rules;
}

export function readAdviceRules(database) {
  const saved = database.objects('AdviceRules')[0];
  if (!saved) throw new Error('Load Advice Notice rules at the office before collecting.');
  return {rules: validateAdviceRules(JSON.parse(saved.json)), loadedAt: saved.loadedAt};
}

export function adviceIsOverdue(noticeDate, rules, collectedAt = new Date(), holidays = []) {
  return calendarIsOverdue(noticeDate, rules.calendarDays, collectedAt, holidays);
}
