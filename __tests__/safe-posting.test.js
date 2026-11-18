import {postLegacyBatch,POSTING_PROTOCOL,completePostingAcknowledgment} from '../src/payments/safePosting';
import {memoryRealm,materializeReceiptLinks} from '../test-support/memoryRealm';
const start=new Date('2026-10-05T16:00:00Z'),end=new Date('2026-10-06T16:00:00Z'),dateKey='06/10/2026';
const receiptDate=new Date('2026-10-06T04:00:00Z');
const base={userName:'SYNTHETIC',receiptDate,pondokId:'FIXTURE',city:'BTU'};
const op=(receiptNo='OP-1',carNo)=>({...base,receiptNo,items:[{opNo:'TEST-OP',opDate:receiptDate,amount:.8,taxAmount:.05,tax:6,carNo}]});
const pa=()=>({...base,receiptNo:'PA-1',carNo:'TESTCAR',paType:'C',status:'pending',items:[{paNo:'TEST-PA',paDate:receiptDate,amount:15,taxAmount:0,tax:0,disAmount:3,disPercent:20,opAmount:0,offence:'SYNTHETIC'}]});
const coupon=()=>({...base,receiptNo:'CP-1',items:[{startingCouponNo:'A001',endingCouponNo:'A002',couponType:'40',amount:.8,taxAmount:0,tax:0}]});
const accepted=body=>({protocol:POSTING_PROTOCOL,requestId:body.requestId,complete:true,accepted:[...body.opReceipts.map(r=>({kind:'op',receiptNo:r.receiptNo,itemCount:r.items.length,status:'accepted'})),...body.paReceipts.map(r=>({kind:'pa',receiptNo:r.receiptNo,itemCount:r.items.length,status:'accepted'})),...body.couponReceipts.map(r=>({kind:'coupon',receiptNo:r.receiptNo,itemCount:r.items.length,status:'accepted'}))]});
let db,http;
const post=(date=dateKey)=>{materializeReceiptLinks(db);return postLegacyBatch(db,http,'https://fixture.invalid',start,end,date);};
beforeEach(()=>{db=memoryRealm();db.tables.OpReceiptHeader=[op()];http={get:jest.fn().mockResolvedValue({data:{protocol:POSTING_PROTOCOL,ready:true}}),post:jest.fn((url,body)=>Promise.resolve({data:accepted(body)}))};});

test('exact complete ack clears only snapshotted OP/coupon headers, archives PA, leaves counters and item history',async()=>{
 const p=pa();db.tables.PaReceiptHeader=[p];db.tables.CouponReceiptHeader=[coupon()];db.tables.OpReceiptItem=[db.tables.OpReceiptHeader[0].items[0]];
 const counters=JSON.stringify(db.tables.GeneralProfile);http.post.mockImplementation((url,body)=>{db.tables.OpReceiptHeader.push({...op('NEW-LATER'),items:[]});return Promise.resolve({data:accepted(body)});});
 expect(await post()).toMatchObject({sent:3,pending:false});expect(db.tables.OpReceiptHeader.map(r=>r.receiptNo)).toEqual(['NEW-LATER']);expect(db.tables.CouponReceiptHeader).toHaveLength(0);expect(p.status).toBe('uploaded');expect(db.tables.PaReceiptHeader).toHaveLength(0);expect(db.tables.OpReceiptItem).toHaveLength(0);expect(db.tables.ReceiptRemovalArchive).toHaveLength(3);expect(db.tables.LegacyPostingOutbox).toHaveLength(0);expect(JSON.stringify(db.tables.GeneralProfile)).toBe(counters);
});

test.each(['bare','partial','wrong-request','wrong-kind','duplicate','extra','incomplete','wrong-protocol'])('%s acknowledgement never clears any selected receipt',async mode=>{
 db.tables.PaReceiptHeader=[pa()];db.tables.CouponReceiptHeader=[coupon()];
 http.post.mockImplementation((url,body)=>{const r=accepted(body);if(mode==='bare')return Promise.resolve({data:''});if(mode==='partial')r.accepted.pop();if(mode==='wrong-request')r.requestId+='x';if(mode==='wrong-kind')r.accepted[0].kind='coupon';if(mode==='duplicate')r.accepted[1]=r.accepted[0];if(mode==='extra')r.accepted.push({kind:'op',receiptNo:'OTHER'});if(mode==='incomplete')r.complete=false;if(mode==='wrong-protocol')r.protocol='other';return Promise.resolve({data:r});});
 expect((await post()).pending).toBe(true);expect(db.tables.OpReceiptHeader).toHaveLength(1);expect(db.tables.PaReceiptHeader[0].status).toBe('uploading');expect(db.tables.CouponReceiptHeader).toHaveLength(1);expect(db.tables.LegacyPostingOutbox).toHaveLength(1);
});

test.each([{}, {protocol:POSTING_PROTOCOL,ready:false}, {protocol:'old',ready:true}])('old/unready office cannot receive a financial upload (%j)',async capability=>{
 http.get.mockResolvedValue({data:capability});expect((await post()).pending).toBe(true);expect(http.post).not.toHaveBeenCalled();expect(db.tables.OpReceiptHeader).toHaveLength(1);expect(db.tables.LegacyPostingOutbox).toHaveLength(1);
});

test('lost response/cold restart retry exact persisted request without recollection or counters, including PA',async()=>{
 db.tables.PaReceiptHeader=[pa()];http.post.mockRejectedValueOnce(Error('after synthetic commit'));expect((await post()).pending).toBe(true);
 const first=JSON.stringify(http.post.mock.calls[0][1]);const snapshot=db.tables.LegacyPostingOutbox[0].payload;const counters=JSON.stringify(db.tables.GeneralProfile);
 // Simulate a new JS process by rebuilding objects from the persisted outbox, no in-memory promise/cache.
 const outbox=JSON.parse(JSON.stringify(db.tables.LegacyPostingOutbox[0]));db.tables.LegacyPostingOutbox=[outbox];
 expect(await post()).toMatchObject({sent:2,pending:false});expect(JSON.stringify(http.post.mock.calls[1][1])).toBe(first);expect(first).toBe(snapshot);expect(db.tables.PaReceiptHeader).toHaveLength(0);expect(JSON.parse(db.tables.ReceiptRemovalArchive.find(a=>a.kind==='pa').payload).status).toBe('uploaded');expect(JSON.stringify(db.tables.GeneralProfile)).toBe(counters);
});

test('non2xx conflict keeps every receipt and same request for reconciliation',async()=>{
 http.post.mockRejectedValue({response:{status:409}});const result=await post();expect(result.message).toMatch(/reconciliation/);expect(db.tables.OpReceiptHeader).toHaveLength(1);expect(db.tables.LegacyPostingOutbox).toHaveLength(1);
});

test.each(['uncertain','uploading','legacy-review'])('historical PA %s without safe outbox remains blocked, never inferred or reset',async status=>{
 db.tables.PaReceiptHeader=[{...pa(),status,uploadPayload:'prior'}];const before=JSON.stringify(db.tables.PaReceiptHeader);await expect(post()).rejects.toThrow(/unknown outcome/);expect(http.post).not.toHaveBeenCalled();expect(JSON.stringify(db.tables.PaReceiptHeader)).toBe(before);
});

test('unsupported MBill keeps itself and entire selected batch without request',async()=>{
 db.tables.MBillReceiptHeader=[{...base,receiptNo:'MBILL-1',items:[]}];await expect(post()).rejects.toThrow(/not supported/);expect(http.post).not.toHaveBeenCalled();expect(db.tables.MBillReceiptHeader).toHaveLength(1);expect(db.tables.OpReceiptHeader).toHaveLength(1);
});

test('receipt modified while upload pending does not get deleted after ack, and blocks unsafe replay',async()=>{
 http.post.mockImplementation((url,body)=>{db.tables.OpReceiptHeader[0].items[0].amount=10;return Promise.resolve({data:accepted(body)});});
 const result=await post();expect(result.pending).toBe(true);expect(result.message).toMatch(/local cleanup needs review/);expect(result.counts.op).toBe(1);expect(db.tables.OpReceiptHeader[0].items[0].amount).toBe(10);expect(db.tables.LegacyPostingOutbox).toHaveLength(1);await expect(post()).rejects.toThrow(/changed after upload/);expect(http.post).toHaveBeenCalledTimes(1);
});

test('local acknowledgement transaction failure rolls back header deletion and keeps outbox for exact retry',async()=>{
 db.tables.CouponReceiptHeader=[coupon()];const original=db.delete.bind(db);db.delete=value=>{if(value && value.id==='pending')throw Error('synthetic disk write failure');original(value);};
 expect((await post()).pending).toBe(true);expect(db.tables.OpReceiptHeader).toHaveLength(1);expect(db.tables.CouponReceiptHeader).toHaveLength(1);expect(db.tables.LegacyPostingOutbox).toHaveLength(1);db.delete=original;expect((await post()).sent).toBe(2);
});

test('different posting day cannot overwrite outstanding batch',async()=>{
 http.post.mockRejectedValueOnce(Error('offline'));await post();const saved=db.tables.LegacyPostingOutbox[0].payload;await expect(post('07/10/2026')).rejects.toThrow(/06\/10\/2026/);expect(db.tables.LegacyPostingOutbox[0].payload).toBe(saved);expect(http.post).toHaveBeenCalledTimes(1);
});

test('corrupt saved outbox is held with no network or deletion',async()=>{
 db.tables.LegacyPostingOutbox=[{id:'pending',dateKey,payload:'not json',requestId:'broken'}];await expect(post()).rejects.toThrow(/unreadable/);expect(http.post).not.toHaveBeenCalled();expect(db.tables.OpReceiptHeader).toHaveLength(1);
});

test('ack order may differ, but exact family and receipt identity set is required',()=>{
 const body={postingProtocol:POSTING_PROTOCOL,requestId:'SYNTHETIC',opReceipts:[op()],paReceipts:[pa()],couponReceipts:[]};const ack=accepted(body);ack.accepted.reverse();expect(completePostingAcknowledgment(ack,body)).toBe(true);
});

test('notice count uses confirmed items, classifies overdue OP correctly, excludes coupons, separates replayed items',async()=>{
 db.tables.OpReceiptHeader=[op()];db.tables.OpReceiptHeader[0].items.push({...db.tables.OpReceiptHeader[0].items[0],opNo:'TEST-OP-2'});
 db.tables.PaReceiptHeader=[pa(),{...pa(),receiptNo:'OVERDUE-OP',paType:'O',items:[{...pa().items[0],paNo:'OLD-OP'}]}];db.tables.CouponReceiptHeader=[coupon()];
 http.post.mockImplementation((url,body)=>{const r=accepted(body);r.accepted.find(a=>a.receiptNo==='OP-1').status='already_received';return Promise.resolve({data:r});});
 const result=await post();expect(result.counts).toEqual({op:3,pa:1,couponReceipts:1,alreadyReceived:2,receipts:4});
 const next=await post();expect(next).toEqual({sent:0,pending:false});expect(http.post).toHaveBeenCalledTimes(1);
});

test.each(['wrong-count','missing-count','unknown-status'])('%s ack cannot claim posted notices or clear headers',async mode=>{
 http.post.mockImplementation((url,body)=>{const r=accepted(body);if(mode==='wrong-count')r.accepted[0].itemCount++;if(mode==='missing-count')delete r.accepted[0].itemCount;if(mode==='unknown-status')r.accepted[0].status='unverified';return Promise.resolve({data:r});});
 const result=await post();expect(result.sent).toBe(0);expect(result.counts).toBeUndefined();expect(db.tables.OpReceiptHeader).toHaveLength(1);
});

test('old false-success PA uploaded marker is held and excluded from new upload, never reclassified or archived',async()=>{
 db.tables.OpReceiptHeader=[];db.tables.PaReceiptHeader=[{...pa(),status:'uploaded',uploadedAt:receiptDate,uploadPayload:JSON.stringify(pa())}];materializeReceiptLinks(db);
 const before=JSON.stringify(db.tables.PaReceiptHeader),details=JSON.stringify(db.tables.PaReceiptItem);
 expect(await post()).toEqual({sent:0,pending:false});expect(http.post).not.toHaveBeenCalled();expect(http.get).not.toHaveBeenCalled();
 expect(JSON.stringify(db.tables.PaReceiptHeader)).toBe(before);expect(JSON.stringify(db.tables.PaReceiptItem)).toBe(details);expect(db.objects('ReceiptRemovalArchive')).toHaveLength(0);
});
