import {adviceItem, adviceBasket, adviceTotals, validateFixedAdvicePolicy} from '../src/advice/collection';
import {saveAdviceReceipt} from '../src/advice/storage';
import {postAdviceBatch} from '../src/advice/payload';
import {adviceReceiptLines} from '../src/advice/receipt';
import {memoryRealm, RULES} from '../test-support/memoryRealm';

// Synthetic downloaded settings: never runtime defaults or verified live rates.
const rules = {...RULES, calendarDays: 14, overdueFee: 20, collectionPolicyVersion: 2,
  feeBasis: 'receipt', baseAmount: 0.8, excessCharges: 1, taxPercent: 6};
const now = new Date('2026-10-18T04:00:00Z');
const draft = (no, overdue) => ({noticeNo: no, noticeDate: overdue ? '2026-10-04' : '2026-10-05',city:'Bintulu',carNo:'TESTCAR'});
const items = (count, overdue, settings=rules) => Array.from({length:count},(_,i)=>adviceItem(draft(`ANFIX${String(i+1).padStart(3,'0')}`,overdue),settings,overdue));

test.each([[1,false,185],[1,true,2185],[2,false,370],[2,true,2370],[13,false,2400],[13,true,4400]])('downloaded rates, base-only tax and once-per-receipt fee: %i / overdue %s', (count,overdue,total) => {
  const allocated=adviceBasket(items(count,overdue),overdue,'receipt'), totals=adviceTotals(allocated);
  expect(totals.total).toBe(total);
  expect(totals.overdue).toBe(overdue?2000:0);
  expect(allocated.every(item=>item.couponNo==='')).toBe(true);
  expect(allocated.filter(item=>item.overdueFee>0)).toHaveLength(overdue?1:0);
  if(count===13){expect(totals.tax).toBe(62);expect(totals.rounding).toBe(-2);}
});

test('canonical sorting allocates identical tax/fee cents independently of entry order', () => {
  const input=items(13,true),copy=JSON.stringify(input);
  expect(adviceBasket(input.slice().reverse(),true,'receipt')).toEqual(adviceBasket(input,true,'receipt'));
  expect(JSON.stringify(input)).toBe(copy);
});

test('amounts and tax derive from downloaded settings, including changed rates and disabled tax', () => {
  const changed={...rules,baseAmount:'1.25',excessCharges:'2.35',taxPercent:'5',overdueFee:'12.34'};
  const row=adviceItem({...draft('ANFIX9',false),baseAmount:'999',excessCharge:'999',couponNo:'INVENTED',taxRate:'99',taxAmount:'99'},changed,false);
  expect(row).toMatchObject({baseAmount:1.25,excessCharge:2.35,taxRate:5,taxAmount:0.06,couponNo:''});
  const zero={...rules,taxEnabled:false,taxPercent:0};
  expect(adviceTotals(adviceBasket(items(2,true,zero),true,'receipt')).total).toBe(2360);
});

test.each([{baseAmount:null},{excessCharges:undefined},{taxPercent:undefined},{feeBasis:null},{feeBasis:'notice'},{taxPercent:101}])('incomplete/unsupported policy never invents a value: %j', invalid => {
  expect(()=>validateFixedAdvicePolicy({...rules,...invalid})).toThrow();
});

test('stored v2 cash, allocation and rate snapshot remain immutable on settings refresh/reprint', () => {
  const db=memoryRealm(),input=items(13,true).reverse();
  const saved=saveAdviceReceipt(db,{items:input,overdue:true,userName:'FIXTURE',amountReceived:'50',rules,now});
  const record=db.objectForPrimaryKey('AdviceReceiptHeader',saved.receiptNo),payload=record.postingPayload;
  const body=JSON.parse(payload);
  expect(body).toMatchObject({collectionPolicyVersion:2,feeBasis:'receipt',totalAmount:'44.00',roundingAmount:'-0.02'});
  expect(body.items.map(row=>row.opNo)).toEqual(items(13,true).map(row=>row.noticeNo));
  expect(body.items.every(row=>row.couponNo==='')).toBe(true);
  expect(record.items.reduce((total,row)=>total+Math.round(row.taxAmount*100),0)).toBe(62);
  db.tables.AdviceRules[0].json=JSON.stringify({protocolVersion:1,configured:false});
  expect(adviceReceiptLines(record).join('\n')).toMatch(/Net Total:\s+44\.00/);
  expect(record.postingPayload).toBe(payload);expect(JSON.parse(record.rulesSnapshot)).toEqual(rules);
});

test('legacy and v2 pending receipts are held unchanged for owner review without HTTP', async () => {
  const db=memoryRealm();
  const legacy=saveAdviceReceipt(db,{items:[adviceItem({...draft('ANOLD1',false),noticeDate:'2026-10-18',baseAmount:'10',excessCharge:'0.03',taxRate:'5',taxAmount:'0.50'},RULES,false)],overdue:false,userName:'FIXTURE',amountReceived:'11',rules:RULES,now});
  const modern=saveAdviceReceipt(db,{items:items(2,true),overdue:true,userName:'FIXTURE',amountReceived:'24',rules,now});
  const original=db.objects('AdviceReceiptHeader').map(row=>row.postingPayload);
  const http={post:jest.fn().mockImplementation((url,body)=>Promise.resolve({data:{protocolVersion:1,receipts:body.adviceReceipts.map(row=>({receiptNo:row.receiptNo,status:'already_received',staged:true,errors:[]}))}}))};
  const result=await postAdviceBatch(db,http,'https://fixture.invalid',new Date('2026-10-18T00:00:00+08:00'),new Date('2026-10-19T00:00:00+08:00'));
  expect(result).toEqual({sent:0,retained:2,blockedLegacy:2});
  expect(http.post).not.toHaveBeenCalled();expect(db.objects('AdviceReceiptHeader').map(row=>row.postingPayload)).toEqual(original);
  expect(legacy.receiptNo).toBe('OP-P1-41');expect(modern.receiptNo).toBe('PA-P1-71');
});
