import {adviceReceiptLines, adviceClosing} from '../src/advice/receipt';

function fixture(overdue=false) {
  return {receiptNo:overdue?'PA-FIXTURE-1':'OP-FIXTURE-1',receiptDate:new Date('2026-10-19T04:00:00Z'),pondokId:'P1',userName:'FIXTURE',city:'Bintulu',carNo:'TESTCAR',overdue,
    amountReceived:50,totalAmount:overdue?23.7:3.7,rounding:0,postingPayload:'EXACT IMMUTABLE ORIGINAL',rulesSnapshot:JSON.stringify({taxPercent:6}),
    items:[1,2].map(n=>({noticeNo:'ANFIXTURE'+n,noticeDate:new Date('2026-10-01T04:00:00Z'),couponNo:'HISTORICAL-COUPON',baseAmount:0.8,excessCharge:1,taxRate:6,taxAmount:0.05,overdueFee:overdue&&n===1?20:0}))};
}

test.each([false,true])('AN %s copy has exactly one number/price row per notice and no per-item details/tender or Advice heading', overdue=>{
  const receipt=fixture(overdue),before=JSON.stringify(receipt),cash=adviceClosing([receipt]);
  const lines=adviceReceiptLines(receipt),start=lines.findIndex(line=>line.includes('AN No.'))+2;
  expect(lines.slice(start,start+2).map(row=>row.trim())).toEqual(overdue ?
    [expect.stringMatching(/^ANFIXTURE1\s+20\.00\s+1\.80$/),expect.stringMatching(/^ANFIXTURE2\s+1\.80$/)] :
    [expect.stringMatching(/^ANFIXTURE1\s+1\.80$/),expect.stringMatching(/^ANFIXTURE2\s+1\.80$/)]);
  expect(lines[start+2]).toBe('-'.repeat(48));
  const output=lines.join('\n');
  ['AN Date:','Coupon:','Base ','Excess ','ADVICE NOTICE','Received:','Change:'].forEach(label=>expect(output).not.toContain(label));
  expect(output).toMatch(/6% of Tax:\s+0\.10/);expect(output).toMatch(overdue?/Net Total:\s+23\.70/:/Net Total:\s+3\.70/);
  expect(lines.every(line=>line.length<=48)).toBe(true);expect(JSON.stringify(receipt)).toBe(before);expect(adviceClosing([receipt])).toEqual(cash);
});

test.each([0,5,5.5,9])('tax summary labels the saved configured rate %s%%, never a fixed6%% or current profile rate', rate=>{
  const receipt=fixture();receipt.rulesSnapshot=JSON.stringify({taxPercent:rate});receipt.items.forEach(item=>{item.taxRate=rate;});
  const output=adviceReceiptLines(receipt).join('\n');
  expect(output).toMatch(new RegExp(`${String(rate).replace('.','\\.')}% of Tax:\\s+0\\.10`));
  expect(output).not.toContain('6% of Tax:');expect(output).toMatch(/Net Total:\s+3\.70/);
});

test('historical mixed tax rates print separate exact stored summaries without changing tax or cash',()=>{
  const receipt=fixture();receipt.items[0].taxRate=5;
  const output=adviceReceiptLines(receipt).join('\n');
  expect(output).toMatch(/5% of Tax:\s+0\.05/);expect(output).toMatch(/6% of Tax:\s+0\.05/);
  expect(output).toMatch(/Sub Total:\s+3\.70/);expect(output).toMatch(/Net Total:\s+3\.70/);
});
