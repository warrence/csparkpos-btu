import moment from 'moment';
import {adviceItem, adviceBasket, adviceTotals, cents} from '../src/advice/collection';
import {saveAdviceReceipt} from '../src/advice/storage';
import {validateAdviceRules, adviceIsOverdue} from '../src/advice/rules';
import {adviceReceiptLines, adviceClosing} from '../src/advice/receipt';
import {memoryRealm, RULES, CONFIG} from '../test-support/memoryRealm';

const NOW = new Date('2026-10-17T04:00:00Z');
const draft = (opNo = 'AN001', date = '2026-10-17', coupon = '') => ({noticeNo: opNo, noticeDate: date, couponNo: coupon,
  city: 'BTU', carNo: 'QAA 1234', baseAmount: '1.21', excessCharge: '0.11', taxRate: '6', taxAmount: '0.07'});
const save = (db, items, overdue = false, received = '100') => saveAdviceReceipt(db, {items, overdue, userName: 'U1', amountReceived: received, rules: RULES, now: NOW});

test('missing or unapproved rules cannot supply fallback rates; zero configured fee is explicit', () => {
  expect(() => validateAdviceRules({configured: false})).toThrow();
  expect(() => validateAdviceRules({...CONFIG, rules: {...RULES, overdueFee: null}})).toThrow();
  expect(validateAdviceRules({...CONFIG, rules: {...RULES, overdueFee: '0.00'}}).overdueFee).toBe('0.00');
});

test('calendar window includes collection day and rejects future/invalid notice dates', () => {
  expect(adviceIsOverdue('2026-10-14', RULES, NOW)).toBe(false);
  expect(adviceIsOverdue('2026-10-13', RULES, NOW)).toBe(true);
  expect(() => adviceIsOverdue('2026-10-18', RULES, NOW)).toThrow();
  expect(() => adviceIsOverdue('2026-02-30', RULES, NOW)).toThrow();
});

test('separate base/excess/tax are retained; BNM rounding excludes grouped overdue fees', () => {
  const items = [adviceItem(draft('AN1', '2026-10-01', 'COUPON-A'), RULES, true),
    adviceItem(draft('AN2', '2026-10-01', 'COUPON-A'), RULES, true),
    adviceItem(draft('AN3', '2026-10-01', 'COUPON-B'), RULES, true)];
  const allocated = adviceBasket(items, true);
  expect(allocated.map(item => item.overdueFee)).toEqual([7.02, 0, 7.02]);
  expect(adviceTotals(allocated)).toEqual({base: 363, excess: 33, tax: 21, overdue: 1404, subtotal: 417, rounding: -2, total: 1819});
  expect(adviceBasket(items.slice(1), true).map(item => item.overdueFee)).toEqual([7.02, 7.02]);
});

test('tax-free policy cannot apply tax to excess; money and duplicate inputs are validated', () => {
  expect(adviceItem(draft(), {...RULES, taxEnabled: false}, false).taxAmount).toBe(0);
  for (const value of ['-1', '', 'NaN', '0.001', '1e5']) expect(() => cents(value)).toThrow();
  expect(() => adviceItem(draft('AN1', '2026-10-01'), RULES, true)).toThrow(/Coupon/);
  const item = adviceItem(draft(), RULES, false);
  expect(() => adviceBasket([item, item], false)).toThrow(/already selected/);
});

test('cash collection creates durable-intent receipt and shared counter together; underpayment does not write', () => {
  const db = memoryRealm();const item = adviceItem(draft(), RULES, false);
  expect(() => save(db, [item], false, '1')).toThrow(/less than/);
  expect(db.objects('AdviceReceiptHeader')).toHaveLength(0);
  expect(db.objects('GeneralProfile')[0].OpReceiptNo).toBe(40);
  expect(save(db, [item], false, '2')).toEqual({receiptNo: 'OP-P1-41', change: 0.60});
  const receipt = db.objects('AdviceReceiptHeader')[0];
  expect(receipt.status).toBe('pending');
  expect(JSON.parse(receipt.postingPayload)).toMatchObject({overdue: false, totalAmount: '1.40', roundingAmount: '0.01', items: [{baseAmount: '1.21', excessCharges: '0.11', taxAmount: '0.07', compoundAmount: '0.00'}]});
  expect(db.objects('GeneralProfile')[0].OpReceiptNo).toBe(41);
  expect(() => save(db, [item])).toThrow(/already has a local receipt/);
});

test('overdue saves in PA numbering and rejects stale/mixed window receipts', () => {
  const db = memoryRealm();const item = adviceItem(draft('AN1', '2026-10-01', 'A'), RULES, true);
  expect(save(db, [item], true).receiptNo).toBe('PA-P1-71');
  expect(() => save(db, [adviceItem(draft('AN2'), RULES, false)], true)).toThrow(/window changed/);
});

test('receipt numbering never reuses archived AN numbers after a counter refresh', () => {
  const db = memoryRealm();save(db, [adviceItem(draft('AN1'), RULES, false)]);
  db.objects('AdviceReceiptHeader')[0].status = 'posted';db.objects('GeneralProfile')[0].OpReceiptNo = 1;
  expect(save(db, [adviceItem(draft('AN2'), RULES, false)]).receiptNo).toBe('OP-P1-42');
});

test('stored component receipt and closing totals survive acknowledgement and rate refresh', () => {
  const db = memoryRealm();save(db, [adviceItem(draft('AN1'), RULES, false)]);
  const receipt = db.objects('AdviceReceiptHeader')[0];const before = adviceReceiptLines(receipt);
  receipt.status = 'posted';db.objects('AdviceRules')[0].json = '{}';
  expect(adviceReceiptLines(receipt)).toEqual(before);
  expect(before.join('\n')).toMatch(/AN1\s+1\.32/);expect(before.join('\n')).toMatch(/Net Total:\s+1\.40/);
  expect(adviceClosing([receipt])).toEqual({base: 121, excess: 11, tax: 7, overdue: 0, rounding: 1, total: 140});
});

test('crossing midnight rechecks classification before collection and preserves a rejected basket without issuing a number', () => {
  const db = memoryRealm();const item = adviceItem(draft('ANMID', '2026-10-14'), RULES, false);
  expect(() => saveAdviceReceipt(db, {items: [item], overdue: false, userName: 'U1', amountReceived: '2', rules: RULES,
    now: new Date(2026, 9, 18, 0, 0, 0)})).toThrow(/window changed/);
  expect(db.objects('AdviceReceiptHeader')).toHaveLength(0);
  expect(db.objects('GeneralProfile')[0].OpReceiptNo).toBe(40);
});

test.each(['', '   ', null])('optional tender %j never changes collected cash, rounding, numbering or wire payload', received => {
  const blank=memoryRealm(), entered=memoryRealm(),item=adviceItem(draft(),RULES,false);
  const a=save(blank,[item],false,received),b=save(entered,[item],false,'2');
  const optional=blank.objects('AdviceReceiptHeader')[0],explicit=entered.objects('AdviceReceiptHeader')[0];
  expect(a.change).toBeNull();expect(b.change).toBe(0.60);
  expect(optional.amountReceived).toBeNull();expect(explicit.amountReceived).toBe(2);
  expect(optional.postingPayload).toBe(explicit.postingPayload);
  expect(adviceClosing([optional])).toEqual(adviceClosing([explicit]));
  const copy=JSON.stringify(optional);
  adviceReceiptLines(optional);expect(JSON.stringify(optional)).toBe(copy);
  expect(adviceReceiptLines(optional).join('\n')).not.toMatch(/Received:|Change:/);
});
