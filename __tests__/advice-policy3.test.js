import fixture from '../test-support/fixtures/advice-policy3-cross-side.json';
import {memoryRealm} from '../test-support/memoryRealm';
import {adviceItem,adviceBasket,adviceTotals,validateFixedAdvicePolicy} from '../src/advice/collection';
import {saveAdviceReceipt} from '../src/advice/storage';
import {advicePayload,postAdviceBatch} from '../src/advice/payload';
import {adviceReceiptLines} from '../src/advice/receipt';
const start=new Date('2026-10-19T00:00:00+08:00'),end=new Date('2026-10-20T00:00:00+08:00');
test('actual encoder and configured rules match all ten policy3 golden cases, totals and fees',()=>{
 const db=memoryRealm();for(const testCase of fixture.cases){const rules=testCase.rules.rules,expected=testCase.envelope.adviceReceipts[0];
  const items=expected.items.map(item=>adviceItem({noticeNo:item.opNo,noticeDate:item.opDate,city:expected.city,carNo:expected.carNo},rules,expected.overdue));
  const saved=saveAdviceReceipt(db,{items,overdue:expected.overdue,userName:'FIXTURE',rules,now:new Date(expected.receiptDate)}),row=db.objectForPrimaryKey('AdviceReceiptHeader',saved.receiptNo);
  expect(JSON.parse(row.postingPayload)).toEqual(expected);expect(advicePayload(row)).toEqual(expected);
  expect(row.items.every(item=>item.taxAmount===(rules.taxPercent===6?0.05:0.06))).toBe(true);
  const lines=adviceReceiptLines(row);row.items.forEach(item=>{const line=lines.find(text=>text.startsWith(item.noticeNo));expect(line.trim().endsWith((item.baseAmount+item.excessCharge+item.taxAmount).toFixed(2))).toBe(true);});
  expect(lines.every(line=>line.length<=48)).toBe(true);
  const totals=adviceTotals(row.items);expect(totals.total).toBe(Math.round(Number(expected.totalAmount)*100));
  expect(totals.rounding).toBe(Math.round(Number(expected.roundingAmount)*100));
  expect(row.items.reduce((sum,item)=>sum+Math.round(item.overdueFee*100),0)).toBe(expected.overdue?Math.round(rules.overdueFee*100):0);
 }
});
test('v2 cumulative and v3 per-notice branches remain distinct; existing v2 cash/tax/print/payload never repriced',async()=>{
 const db=memoryRealm(),rules={...fixture.cases[2].rules.rules,collectionPolicyVersion:2},drafts=fixture.cases[2].envelope.adviceReceipts[0].items.map(item=>adviceItem({noticeNo:item.opNo,noticeDate:'2026-10-19',city:'Bintulu',carNo:'TESTCAR'},rules,false));
 const v2=adviceBasket(drafts,false,'receipt',2),v3=adviceBasket(drafts,false,'receipt',3);
 expect(adviceTotals(v2).tax).toBe(62);expect(adviceTotals(v2).total).toBe(2400);expect(adviceTotals(v3).tax).toBe(65);expect(adviceTotals(v3).total).toBe(2405);
 const saved=saveAdviceReceipt(db,{items:drafts,overdue:false,userName:'FIXTURE',rules,now:new Date('2026-10-19T04:00:00Z')}),row=db.objectForPrimaryKey('AdviceReceiptHeader',saved.receiptNo),original=row.postingPayload,print=adviceReceiptLines(row);
 db.tables.AdviceRules[0].json=JSON.stringify(fixture.cases[2].rules);
 expect(row.postingPayload).toBe(original);expect(adviceReceiptLines(row)).toEqual(print);
 const http={post:jest.fn(async()=>({data:{protocolVersion:1,receipts:[{receiptNo:saved.receiptNo,status:'already_received',staged:true,errors:[]}]}}))};
 expect(await postAdviceBatch(db,http,'https://fixture.invalid',start,end)).toEqual({sent:0,retained:1,blockedLegacy:1});expect(http.post).not.toHaveBeenCalled();expect(row.postingPayload).toBe(original);expect(JSON.parse(original).collectionPolicyVersion).toBe(2);
});
test('policy3 tax disabled uses explicit zero policy, not a configured financial fallback',()=>{
 const rules={...fixture.cases[0].rules.rules,taxEnabled:false,taxPercent:0},item=adviceItem({noticeNo:'ANZERO',noticeDate:'2026-10-19',city:'Bintulu',carNo:'TESTCAR'},rules,false);
 expect(item.taxAmount).toBe(0);expect(adviceTotals(adviceBasket([item],false,'receipt',3)).total).toBe(180);
 expect(()=>validateFixedAdvicePolicy({...rules,collectionPolicyVersion:4})).toThrow();
});
