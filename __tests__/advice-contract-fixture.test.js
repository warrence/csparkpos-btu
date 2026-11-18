import envelope from '../test-support/fixtures/advice-protocol-v1-synthetic.json';
import {memoryRealm, RULES} from '../test-support/memoryRealm';
import {adviceItem} from '../src/advice/collection';
import {saveAdviceReceipt} from '../src/advice/storage';

test('actual POS encoder exactly matches the shared current/overdue office protocol fixtures', () => {
  const db = memoryRealm();expect(envelope.protocolVersion).toBe(1);
  envelope.adviceReceipts.forEach(expected => {
    const items = expected.items.map(item => adviceItem({noticeNo: item.opNo, noticeDate: item.opDate,
      couponNo: item.couponNo, city: expected.city, carNo: expected.carNo,
      baseAmount: item.baseAmount, excessCharge: item.excessCharges, taxRate: item.taxPercent, taxAmount: item.taxAmount}, RULES, expected.overdue));
    const saved = saveAdviceReceipt(db, {items, overdue: expected.overdue, userName: expected.userName,
      amountReceived: expected.totalAmount, rules: RULES, now: new Date(expected.receiptDate)});
    expect(JSON.parse(db.objectForPrimaryKey('AdviceReceiptHeader', saved.receiptNo).postingPayload)).toEqual(expected);
  });
});
