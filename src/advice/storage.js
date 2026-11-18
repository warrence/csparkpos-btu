import {assertNewAdviceNotices} from './duplicates';
import moment from 'moment';
import {readHolidayCalendar} from '../payments/holidayCalendar';
import {validateAdviceRules, adviceIsOverdue} from './rules';
import {adviceBasket, adviceTotals, cents, validateFixedAdvicePolicy} from './collection';
import {advicePayload} from './payload';
import {nextReceiptNumber} from '../payments/receiptNumbers';
import {paymentTender} from '../payments/tender';
import {adviceReminder} from './reminder';

export function saveAdviceReceipt(realm, {items, overdue, userName, amountReceived, reminderNo, rules, now = new Date()}) {
  assertNewAdviceNotices(realm, items);
  validateAdviceRules({protocolVersion: 1, configured: true, rules});
  const reminder=adviceReminder(reminderNo);
  if(reminder&&rules.reminderNoSupported!==true)
    throw new Error('Download updated office settings before collecting a reminder receipt.');
  const fixed = [2,3].includes(rules.collectionPolicyVersion);
  if (fixed) validateFixedAdvicePolicy(rules);
  if (fixed && overdue && items.some(item => moment(item.noticeDate).format('YYYY-MM-DD') !== moment(items[0].noticeDate).format('YYYY-MM-DD')))
    throw new Error('Use one notice date per overdue receipt. Clear and re-enter the advice notices.');
  if (items.length > 100) throw new Error('Use at most 100 notices per receipt.');
  const holidays = readHolidayCalendar(realm).dates;
  items.forEach(item => {
    if (adviceIsOverdue(moment(item.noticeDate).format('YYYY-MM-DD'), rules, now, holidays) !== overdue) throw new Error('The payment window changed. Clear and re-enter the advice notices.');
    if (!rules.taxEnabled && (item.taxRate !== 0 || item.taxAmount !== 0)) throw new Error('Tax is not enabled for advice collection.');
    if (overdue && cents(item.overdueFee) !== cents(rules.overdueFee)) throw new Error('Advice overdue rate changed. Re-enter the receipt.');
    if (fixed && (cents(item.baseAmount) !== cents(rules.baseAmount) || cents(item.excessCharge) !== cents(rules.excessCharges)))
      throw new Error('Advice fixed amounts changed. Re-enter the receipt.');
    if (fixed && (cents(item.taxRate) !== cents(rules.taxPercent) ||
        cents(item.taxAmount) !== Math.round(cents(item.baseAmount) * cents(rules.taxPercent) / 10000)))
      throw new Error('Advice tax policy changed. Re-enter the receipt.');
  });
  const normalized = adviceBasket(items, overdue, fixed ? rules.feeBasis : undefined, rules.collectionPolicyVersion);
  if (!normalized.length) throw new Error('Add an advice notice first.');
  const totals = adviceTotals(normalized);
  if (totals.total > 99999999) throw new Error('Receipt total exceeds the office limit.');
  if (totals.total <= 0) throw new Error('The advice receipt total must be greater than zero.');
  // Tender entry is optional, as in the original OPN flow. Blank is unknown,
  // never zero or assumed exact cash; it does not alter the collected total.
  const {received, change} = paymentTender(amountReceived, totals.total / 100);
  let receiptNo;
  realm.write(() => {
    const profile = realm.objects('GeneralProfile')[0];
    if (!profile || !profile.PondokId || !userName) throw new Error('Load the pondok profile and sign in before collecting.');
    assertNewAdviceNotices(realm, normalized);
    if (profile.PondokId.length > 10 || userName.length > 10) throw new Error('Pondok or user identifier exceeds the office limit.');
    const {counter, next, receiptNo: allocated} = nextReceiptNumber(realm, profile, overdue);
    receiptNo = allocated;
    const data = {receiptNo, userName, receiptDate: now, pondokId: profile.PondokId,
      city: normalized[0].city, carNo: normalized[0].carNo, reminderNo: reminder||null, overdue, status: 'pending',
      amountReceived: received, totalAmount: totals.total / 100, rounding: totals.rounding / 100,
      items: normalized.map((item, index) => ({...item, id: `${receiptNo}|${index}`}))};
    data.rulesSnapshot = JSON.stringify(rules);
    data.postingPayload = JSON.stringify(advicePayload(data));
    realm.create('AdviceReceiptHeader', data);
    profile[counter] = next;
  });
  return {receiptNo, change};
}
