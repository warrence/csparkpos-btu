import {planReceiptRemoval} from '../src/payments/receiptRemoval';
import {postAdviceBatch, acknowledgedAdvice} from '../src/advice/payload';
import {adviceItem} from '../src/advice/collection';
import {saveAdviceReceipt} from '../src/advice/storage';
import {memoryRealm, RULES} from '../test-support/memoryRealm';
const POST_RULES={...RULES,collectionPolicyVersion:3,feeBasis:'receipt',baseAmount:1,excessCharges:0.2,taxPercent:6};
const NOW = new Date('2026-10-17T04:00:00Z');
const START = new Date('2026-10-17T00:00:00Z');const END = new Date('2026-10-18T00:00:00Z');
function add(db, number) {
  return saveAdviceReceipt(db, {items: [adviceItem({noticeNo: number, noticeDate: '2026-10-17', city: 'BTU', carNo: 'Q123', baseAmount: '1', excessCharge: '0.20', taxRate: '6', taxAmount: '0.06'}, POST_RULES, false)],
    overdue: false, userName: 'U1', amountReceived: '2', rules: POST_RULES, now: NOW});
}
const ack = (no, status = 'accepted', staged = true) => ({receiptNo: no, status, staged, errors: []});

test('only exact explicit successful storage acknowledgements count; 200/empty/unknown/duplicate entries do not', () => {
  const sent = [{receiptNo: 'R1'}];
  for (const data of ['', {}, {protocolVersion: 2, receipts: [ack('R1')]},
    {protocolVersion: 1, receipts: [ack('R1', 'rejected', false)]},
    {protocolVersion: 1, receipts: [ack('R1', 'accepted', false)]},
    {protocolVersion: 1, receipts: [ack('OTHER')]},
    {protocolVersion: 1, receipts: [ack('R1'), ack('R1')]}]) expect(acknowledgedAdvice(data, sent)).toEqual([]);
  expect(acknowledgedAdvice({protocolVersion: 1, receipts: [ack('R1', 'already_received')]}, sent)).toEqual(['R1']);
});

test('partial response deletes only exact acknowledged AN receipts and leaves ordinary receipts alone', async () => {
  const db = memoryRealm();const a = add(db, 'AN1');const b = add(db, 'AN2');
  db.tables.OpReceiptHeader = [{receiptNo: 'LEGACY'}];
  const http = {post: jest.fn(async () => ({data: {protocolVersion: 1, receipts: [ack(a.receiptNo), ack(b.receiptNo, 'rejected', false)]}}))};
  expect(await postAdviceBatch(db, http, 'https://fixture.invalid', START, END)).toEqual({sent: 1, retained: 1});
  expect(http.post.mock.calls[0][0]).toBe('https://fixture.invalid/api/pondok-advice-posting');
  expect(Object.keys(http.post.mock.calls[0][1])).toEqual(['protocolVersion', 'adviceReceipts']);
  expect(db.objectForPrimaryKey('AdviceReceiptHeader', a.receiptNo)).toBeUndefined();
  expect(db.objects('AdviceReceiptItem').map(row=>row.noticeNo)).toEqual(['AN2']);
  expect(db.objectForPrimaryKey('AdviceReceiptHeader', b.receiptNo).status).toBe('pending');
  expect(db.tables.OpReceiptHeader).toEqual([{receiptNo: 'LEGACY'}]);
});

test('lost response and unacknowledged 200 retain identical original payload across changed rates and retries', async () => {
  const db = memoryRealm();const saved = add(db, 'AN1');
  const http = {post: jest.fn().mockRejectedValueOnce(new Error('response lost')).mockResolvedValueOnce({data: ''})
    .mockResolvedValueOnce({data: {protocolVersion: 1, receipts: [ack(saved.receiptNo, 'already_received')]}})};
  const original = db.objects('AdviceReceiptHeader')[0].postingPayload;
  expect(await postAdviceBatch(db, http, 'https://fixture.invalid', START, END)).toEqual({sent: 0, retained: 1});
  db.tables.AdviceRules[0].json = '{}';
  expect(await postAdviceBatch(db, http, 'https://fixture.invalid', START, END)).toEqual({sent: 0, retained: 1});
  expect(await postAdviceBatch(db, http, 'https://fixture.invalid', START, END)).toEqual({sent: 1, retained: 0});
  for (const call of http.post.mock.calls) expect(JSON.stringify(call[1].adviceReceipts[0])).toBe(original);
  await postAdviceBatch(db, http, 'https://fixture.invalid', START, END);
  expect(http.post).toHaveBeenCalledTimes(3);
  expect(db.objects('AdviceReceiptHeader')).toHaveLength(0);
  expect(db.objects('AdviceReceiptItem')).toHaveLength(0);
});

test('damaged local payload remains pending and is never sent', async () => {
  const db = memoryRealm();add(db, 'AN1');db.objects('AdviceReceiptHeader')[0].postingPayload = '{';
  const http = {post: jest.fn()};
  expect(await postAdviceBatch(db, http, 'https://fixture.invalid', START, END)).toEqual({sent: 0, retained: 1});
  expect(http.post).not.toHaveBeenCalled();
});

test('large daily batches are split at the server limit of 100 receipts', async () => {
  const db = memoryRealm();for (let i = 0; i < 101; i++) add(db, 'AN' + i);
  const http = {post: jest.fn(async (url, body) => ({data: {protocolVersion: 1, receipts: body.adviceReceipts.map(row => ack(row.receiptNo))}}))};
  expect(await postAdviceBatch(db, http, 'https://fixture.invalid', START, END)).toEqual({sent: 101, retained: 0});
  expect(http.post.mock.calls.map(call => call[1].adviceReceipts.length)).toEqual([100, 1]);
});

test('422 envelope failure and failed local acknowledgment commit preserve pending receipt and immutable identity', async () => {
  const db = memoryRealm();add(db, 'AN422');
  const before = db.objects('AdviceReceiptHeader')[0].postingPayload;
  const no = db.objects('AdviceReceiptHeader')[0].receiptNo;
  const http = {post: jest.fn().mockRejectedValueOnce({response: {status: 422, data: {errors: {adviceReceipts: ['invalid envelope']}}}})
    .mockResolvedValue({data: {protocolVersion: 1, receipts: [ack(no)]}})};
  expect(await postAdviceBatch(db, http, 'https://fixture.invalid', START, END)).toEqual({sent: 0, retained: 1});
  const write = db.write.bind(db);
  db.write = callback => write(() => {callback();throw new Error('fixture commit failed');});
  expect(await postAdviceBatch(db, http, 'https://fixture.invalid', START, END)).toEqual({sent: 0, retained: 1});
  expect(db.objects('AdviceReceiptHeader')[0]).toMatchObject({receiptNo: no, postingPayload: before, status: 'pending'});
});

test('posting includes the selected local day start and excludes the next midnight with timezone offsets preserved', async () => {
  const db = memoryRealm();
  const start = new Date(2026, 9, 17);const end = new Date(2026, 9, 18);
  const dates = [new Date(start.getTime() - 1), start, new Date(end.getTime() - 1), end];
  db.tables.AdviceReceiptHeader = dates.map((date, index) => ({receiptNo: 'OP-P1-' + index, receiptDate: date, status: 'pending',
    items: [], postingPayload: JSON.stringify({collectionPolicyVersion:3,receiptNo: 'OP-P1-' + index, receiptDate: date.toISOString()})}));
  const http = {post: jest.fn(async (url, body) => ({data: {protocolVersion: 1, receipts: body.adviceReceipts.map(row => ack(row.receiptNo))}}))};
  expect(await postAdviceBatch(db, http, 'https://fixture.invalid', start, end)).toEqual({sent: 2, retained: 0});
  expect(http.post.mock.calls[0][1].adviceReceipts.map(row => row.receiptNo)).toEqual(['OP-P1-1', 'OP-P1-2']);
  expect(db.tables.AdviceReceiptHeader.map(row => row.receiptNo)).toEqual(['OP-P1-0','OP-P1-3']);
  // Two representations of the same instant always upload one canonical ISO timestamp.
  const offset = new Date('2026-10-17T00:00:00+08:00');
  expect(offset.toISOString()).toBe('2026-10-16T16:00:00.000Z');
});

test('receipt timestamp offsets canonicalize without changing the notice calendar date or retry payload', async () => {
  const db = memoryRealm();
  const collectedAt = new Date('2026-10-17T23:59:59+08:00');
  const item = adviceItem({noticeNo: 'ANOFFSET', noticeDate: '2026-10-17', city: 'BTU', carNo: 'Q123', baseAmount: '1', excessCharge: '0', taxRate: '0', taxAmount: '0'}, POST_RULES, false);
  saveAdviceReceipt(db, {items: [item], overdue: false, userName: 'U1', amountReceived: '2', rules: POST_RULES, now: collectedAt});
  const receipt = db.objects('AdviceReceiptHeader')[0];const payload = JSON.parse(receipt.postingPayload);
  expect(payload.receiptDate).toBe('2026-10-17T15:59:59.000Z');
  expect(payload.items[0].opDate).toBe('2026-10-17');
  const http = {post: jest.fn().mockRejectedValue(new Error('offline'))};
  const start = new Date(collectedAt);start.setHours(0, 0, 0, 0);const end = new Date(start);end.setDate(end.getDate() + 1);
  await postAdviceBatch(db, http, 'https://fixture.invalid', start, end);
  await postAdviceBatch(db, http, 'https://fixture.invalid', start, end);
  expect(http.post.mock.calls.map(call => call[1].adviceReceipts[0])).toEqual([payload, payload]);
  expect(receipt.postingPayload).toBe(JSON.stringify(payload));
});


test('AN counts accepted notice items, not receipt headers; partial failures and repeated taps never inflate totals',async()=>{
 const db=memoryRealm();
 const items=['AN-COUNT1','AN-COUNT2'].map(noticeNo=>adviceItem({noticeNo,noticeDate:'2026-10-17',city:'BTU',carNo:'Q123',baseAmount:'1',excessCharge:'0.20',taxRate:'6',taxAmount:'0.06'},POST_RULES,false));
 const a=saveAdviceReceipt(db,{items,overdue:false,userName:'U1',rules:POST_RULES,now:NOW}),b=add(db,'AN-COUNT3');
 const http={post:jest.fn(async()=>({data:{protocolVersion:1,receipts:[ack(a.receiptNo,'already_received'),ack(b.receiptNo,'rejected',false)]}}))};
 const first=await postAdviceBatch(db,http,'https://fixture.invalid',START,END,true);
 expect(first).toEqual({sent:1,retained:1,notices:2,alreadyReceivedNotices:2,confirmedReceipts:1});
 expect(await postAdviceBatch(db,http,'https://fixture.invalid',START,END,true)).toEqual({sent:0,retained:1,notices:0,alreadyReceivedNotices:0,confirmedReceipts:0});
});


test('AN count tolerates null and unrelated acknowledgments while counting only exact accepted items',async()=>{
 const db=memoryRealm(),a=add(db,'AN-NULL');const http={post:jest.fn(async()=>({data:{protocolVersion:1,receipts:[null,ack('UNRELATED'),ack(a.receiptNo)]}}))};
 expect(await postAdviceBatch(db,http,'https://fixture.invalid',START,END,true)).toEqual({sent:1,retained:0,notices:1,alreadyReceivedNotices:0,confirmedReceipts:1});
});


test('confirmed AN notice count survives local cleanup failure while pending data stays intact',async()=>{
 const db=memoryRealm(),a=add(db,'AN-DISK');const http={post:jest.fn(async()=>({data:{protocolVersion:1,receipts:[ack(a.receiptNo)]}}))};
 const write=db.write.bind(db);let writes=0;db.write=fn=>write(()=>{fn();if(++writes>1)throw Error('synthetic commit failure');});
 expect(await postAdviceBatch(db,http,'https://fixture.invalid',START,END,true)).toEqual({sent:0,retained:1,notices:1,alreadyReceivedNotices:0,confirmedReceipts:1});
 expect(db.objects('AdviceReceiptHeader')).toHaveLength(1);
});

test('later AN batches are deletion-guarded before the first network await',async()=>{
 const db=memoryRealm();for(let i=0;i<101;i++)add(db,'BATCH'+i);
 const last=db.objects('AdviceReceiptHeader')[100].receiptNo;
 const http={post:jest.fn(async(url,body)=>{
   expect(()=>planReceiptRemoval(db,[{kind:'an',receiptNo:last}])).toThrow(/may already/);
   return {data:{protocolVersion:1,receipts:body.adviceReceipts.map(r=>ack(r.receiptNo))}};
 })};
 expect(await postAdviceBatch(db,http,'https://fixture.invalid',START,END)).toEqual({sent:101,retained:0});
 expect(db.objects('ReceiptUploadAttempt')).toHaveLength(0);expect(http.post).toHaveBeenCalledTimes(2);
});
