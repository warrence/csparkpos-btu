// Owner-confirmed policy; receipt identities and notice amounts are synthetic.
import response from '../test-support/fixtures/advice-rules-bintulu-confirmed.json';
import envelope from '../test-support/fixtures/advice-protocol-v1-bintulu-confirmed.json';
import {memoryRealm} from '../test-support/memoryRealm';
import LoadAdviceRules from '../src/components/load-data/LoadAdviceRules';
import {readAdviceRules, adviceIsOverdue} from '../src/advice/rules';
import {adviceItem} from '../src/advice/collection';
import {saveAdviceReceipt} from '../src/advice/storage';
import {postAdviceBatch} from '../src/advice/payload';
import {adviceClosing, adviceReceiptLines} from '../src/advice/receipt';
import axios from 'axios';
let mockDatabase;
jest.mock('../src/realm', () => ({
  write: callback => mockDatabase.write(callback),
  create: (...args) => mockDatabase.create(...args),
}));
jest.mock('../src/global', () => ({SERVER_URL: 'https://fixture.invalid'}));
jest.mock('axios', () => ({get: jest.fn(), post: jest.fn()}));
beforeEach(() => {mockDatabase = memoryRealm();mockDatabase.tables.AdviceRules = [];jest.clearAllMocks();});

async function loadConfirmedPolicy() {
  axios.get.mockResolvedValue({data: response});
  expect(await LoadAdviceRules()).toBe(true);
  return readAdviceRules(mockDatabase).rules;
}

test('downloaded 14-day Bintulu policy uses inclusive calendar days and changes at the next collection day', async () => {
  expect(() => readAdviceRules(mockDatabase)).toThrow();
  const rules = await loadConfirmedPolicy();
  expect(rules).toMatchObject({calendarDays: 14, overdueFee: 20, taxEnabled: true});
  const now = new Date('2026-10-17T04:00:00Z');
  expect(adviceIsOverdue('2026-10-17', rules, now)).toBe(false);
  expect(adviceIsOverdue('2026-10-04', rules, now)).toBe(false);
  expect(adviceIsOverdue('2026-10-03', rules, now)).toBe(true);
  expect(adviceIsOverdue('2026-10-04', rules, new Date('2026-10-18T04:00:00Z'))).toBe(true);
});

test('cached owner policy produces exact office fixtures, grouped RM20 fees, stored notice tax and retained retries', async () => {
  const rules = await loadConfirmedPolicy();
  // Collection works solely from the cached policy after the office load.
  axios.get.mockRejectedValue(new Error('offline'));
  envelope.adviceReceipts.forEach(expected => {
    const items = expected.items.map(item => adviceItem({noticeNo: item.opNo, noticeDate: item.opDate,
      couponNo: item.couponNo, city: expected.city, carNo: expected.carNo,
      baseAmount: item.baseAmount, excessCharge: item.excessCharges, taxRate: item.taxPercent, taxAmount: item.taxAmount}, rules, expected.overdue));
    const saved = saveAdviceReceipt(mockDatabase, {items, overdue: expected.overdue, userName: expected.userName,
      amountReceived: expected.totalAmount, rules, now: new Date(expected.receiptDate)});
    expect(JSON.parse(mockDatabase.objectForPrimaryKey('AdviceReceiptHeader', saved.receiptNo).postingPayload)).toEqual(expected);
  });
  expect(axios.get).toHaveBeenCalledTimes(1); // no collection-time lookup
  const records = mockDatabase.objects('AdviceReceiptHeader');
  expect(records[1].items.map(item => item.overdueFee)).toEqual([20, 0, 20]);
  expect(records[1].items.map(item => item.taxAmount)).toEqual([0.60, 0.60, 0.60]); // excess is not taxed
  expect(adviceClosing(records)).toEqual({base: 4000, excess: 12, tax: 240, overdue: 4000, rounding: 3, total: 8255});
  expect(adviceReceiptLines(records[1]).join('\n')).toMatch(/Net Total:\s+71\.90/);
  const original = records.map(row => row.postingPayload);
  const start = new Date(2026, 9, 17), end = new Date(2026, 9, 18);
  expect(await postAdviceBatch(mockDatabase, axios, 'https://fixture.invalid', start, end)).toEqual({sent:0,retained:2,blockedLegacy:2});
  expect(axios.post).not.toHaveBeenCalled();expect(records.map(row=>row.postingPayload)).toEqual(original);
  expect(mockDatabase.objects('AdviceReceiptHeader')).toHaveLength(2);

});

test('current GST6 enables collection without replacing a historical notice tax percent or taxing its excess', async () => {
  const rules = await loadConfirmedPolicy();
  const item = adviceItem({noticeNo: 'ANHIST5', noticeDate: '2026-10-04', city: 'Bintulu', carNo: 'TESTCAR',
    baseAmount: '10.00', excessCharge: '2.00', taxRate: '5.00', taxAmount: '0.50'}, rules, false);
  const saved = saveAdviceReceipt(mockDatabase, {items: [item], overdue: false, userName: 'FIXTURE',
    amountReceived: '12.50', rules, now: new Date('2026-10-17T04:00:00Z')});
  const receipt = mockDatabase.objectForPrimaryKey('AdviceReceiptHeader', saved.receiptNo);
  expect(JSON.parse(receipt.postingPayload)).toMatchObject({totalAmount: '12.50', roundingAmount: '0.00',
    items: [{baseAmount: '10.00', excessCharges: '2.00', taxPercent: '5.00', taxAmount: '0.50', compoundAmount: '0.00'}]});
  expect(adviceReceiptLines(receipt).join('\n')).toMatch(/Tax:\s+0\.50/);
});
