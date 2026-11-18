import {memoryRealm,RULES} from '../test-support/memoryRealm';
import {adviceItem} from '../src/advice/collection';
import {saveAdviceReceipt} from '../src/advice/storage';
import {postAdviceBatch} from '../src/advice/payload';
import {adviceClosing} from '../src/advice/receipt';
import {planUploadedAdviceCleanup,removeConfirmedUploadedAdvice} from '../src/advice/cleanup';
const POST_RULES={...RULES,collectionPolicyVersion:3,feeBasis:'receipt',baseAmount:1,excessCharges:0.2,taxPercent:6};
const START=new Date('2026-10-17T00:00:00Z'),END=new Date('2026-10-18T00:00:00Z');
function add(db,no,overdue=false){const saved=saveAdviceReceipt(db,{items:[adviceItem({noticeNo:no,noticeDate:overdue?'2026-10-01':'2026-10-17',city:'BTU',carNo:'TESTCAR',baseAmount:'1',excessCharge:'0.2',taxRate:'6',taxAmount:'0.06',couponNo:overdue?'QACPN':''},POST_RULES,overdue)],overdue,userName:'FIXTURE',rules:POST_RULES,now:new Date('2026-10-17T04:00:00Z')});return db.objectForPrimaryKey('AdviceReceiptHeader',saved.receiptNo);}
const ack=receiptNo=>({receiptNo,status:'accepted',staged:true,errors:[]});
function setup(){const db=memoryRealm();db.tables.Pass=[{employeeId:'FIXTURE'}];db.tables.OpReceiptHeader=[{receiptNo:'UNRELATED-OP'}];db.tables.PaReceiptHeader=[{receiptNo:'UNRELATED-PA'}];return db;}
function uploaded(db,no,overdue=false){const row=add(db,no,overdue);row.status='posted';row.postedAt=new Date('2026-10-17T06:00:00Z');return row;}
const httpFor=rows=>({post:jest.fn(async()=>({data:{protocolVersion:1,receipts:rows}}))});
test('exact mixed acknowledgments delete headers/details/outbox/cash only for acked current/overdue receipts; recoverable history outside active totals; counters/config/other models unchanged',async()=>{
 const db=setup(),a=add(db,'ANCUR'),b=add(db,'ANOLD',true),pending=add(db,'ANKEEP'),archive=uploaded(db,'ANARCHIVE');
 const noA=a.receiptNo,noB=b.receiptNo,profile=JSON.stringify(db.tables.GeneralProfile),settings=JSON.stringify([db.tables.AdviceRules,db.tables.Pass,db.tables.OpReceiptHeader,db.tables.PaReceiptHeader]);
 const keepPayload=pending.postingPayload,archivePayload=archive.postingPayload;
 expect(await postAdviceBatch(db,httpFor([ack(noA),ack(noB),{...ack(pending.receiptNo),status:'rejected',staged:false}]),'https://fixture.invalid',START,END)).toEqual({sent:2,retained:1});
 expect(db.objects('AdviceReceiptHeader').map(row=>row.receiptNo)).toEqual([pending.receiptNo,archive.receiptNo]);
 expect(db.objects('AdviceReceiptItem').map(row=>row.noticeNo)).toEqual(['ANKEEP','ANARCHIVE']);
 expect(db.objects('ReceiptRemovalArchive').map(r=>r.receiptNo).sort()).toEqual([noA,noB].sort());expect(db.objects('ReceiptRemovalArchive').every(r=>r.removedBy==='office-upload-confirmed')).toBe(true);
 expect(adviceClosing(db.objects('AdviceReceiptHeader')).total).toBe(Math.round((pending.totalAmount+archive.totalAmount)*100));
 expect(pending.postingPayload).toBe(keepPayload);expect(archive.postingPayload).toBe(archivePayload);
 expect(JSON.stringify(db.tables.GeneralProfile)).toBe(profile);expect(JSON.stringify([db.tables.AdviceRules,db.tables.Pass,db.tables.OpReceiptHeader,db.tables.PaReceiptHeader])).toBe(settings);
});
test('in-flight payload replacement or pending-to-uploaded change is not deleted by an older acknowledgment',async()=>{
 const db=setup(),a=add(db,'ANCHANGE'),b=add(db,'ANSTATE');
 const http={post:jest.fn(async()=>{a.postingPayload+=' ';b.status='posted';return {data:{protocolVersion:1,receipts:[ack(a.receiptNo),ack(b.receiptNo)]}};})};
 expect(await postAdviceBatch(db,http,'https://fixture.invalid',START,END)).toEqual({sent:0,retained:2});expect(db.objects('AdviceReceiptHeader')).toHaveLength(2);expect(db.objects('AdviceReceiptItem')).toHaveLength(2);
});
test('failed local child/header deletion rolls back whole acknowledgment batch; exact retry removes both without new numbering',async()=>{
 const db=setup(),a=add(db,'ANROLL1'),b=add(db,'ANROLL2'),original=JSON.stringify(db.tables),http=httpFor([ack(a.receiptNo),ack(b.receiptNo)]),del=db.delete.bind(db);let calls=0;
 db.delete=value=>{del(value);if(++calls===3)throw Error('Synthetic deletion failure');};
 expect(await postAdviceBatch(db,http,'https://fixture.invalid',START,END)).toEqual({sent:0,retained:2});expect(JSON.stringify({...db.tables,ReceiptUploadAttempt:[]})).toBe(original);expect(db.objects('ReceiptUploadAttempt').length).toBeGreaterThan(0);
 db.delete=del;expect(await postAdviceBatch(db,http,'https://fixture.invalid',START,END)).toEqual({sent:2,retained:0});expect(db.objects('AdviceReceiptHeader')).toHaveLength(0);expect(db.objects('AdviceReceiptItem')).toHaveLength(0);
 expect(http.post.mock.calls[0][1]).toEqual(http.post.mock.calls[1][1]);
});
test('corrupt shared detail ownership retains entire batch instead of harming another receipt',async()=>{
 const db=setup(),a=add(db,'ANSHARE1'),b=add(db,'ANSHARE2');b.items.push(a.items[0]);const before=JSON.stringify(db.tables);
 expect(await postAdviceBatch(db,httpFor([ack(a.receiptNo)]),'https://fixture.invalid',START,END)).toEqual({sent:0,retained:2});expect(JSON.stringify({...db.tables,ReceiptUploadAttempt:[]})).toBe(before);expect(db.objects('ReceiptUploadAttempt').length).toBeGreaterThan(0);
});
test('cleanup review alone is read-only, only explicit confirmed exact uploaded manifest removes current/overdue archives and details; pending/other models/counters retained',()=>{
 const db=setup(),a=uploaded(db,'ANUP1'),b=uploaded(db,'ANUP2',true),pending=add(db,'ANPEND');const before=JSON.stringify(db.tables),plan=planUploadedAdviceCleanup(db);
 expect(plan.receipts.map(row=>row.receiptNo)).toEqual([a.receiptNo,b.receiptNo].sort());expect(JSON.stringify(db.tables)).toBe(before);
 const keep=pending.postingPayload,profile=JSON.stringify(db.tables.GeneralProfile);expect(removeConfirmedUploadedAdvice(db,plan)).toBe(2);
 expect(db.objects('AdviceReceiptHeader').map(row=>row.receiptNo)).toEqual([pending.receiptNo]);expect(db.objects('AdviceReceiptItem').map(row=>row.noticeNo)).toEqual(['ANPEND']);expect(pending.postingPayload).toBe(keep);expect(JSON.stringify(db.tables.GeneralProfile)).toBe(profile);
 expect(()=>removeConfirmedUploadedAdvice(db,plan)).toThrow('changed');
});
test.each(['new-upload','pending','amount','payload'])('cleanup refuses stale reviewed set (%s), never silently broadens deletion',change=>{
 const db=setup(),row=uploaded(db,'ANREVIEW'),plan=planUploadedAdviceCleanup(db);
 if(change==='new-upload')uploaded(db,'ANNEW');if(change==='pending')row.status='pending';if(change==='amount')row.totalAmount+=1;if(change==='payload')row.postingPayload+=' ';
 const before=JSON.stringify(db.tables);expect(()=>removeConfirmedUploadedAdvice(db,plan)).toThrow('changed');expect(JSON.stringify(db.tables)).toBe(before);
});
test('cleanup transaction rollback preserves all reviewed data after injected detail deletion failure',()=>{
 const db=setup();uploaded(db,'ANFAIL');const plan=planUploadedAdviceCleanup(db),before=JSON.stringify(db.tables),del=db.delete.bind(db);db.delete=value=>{del(value);throw Error('Synthetic cleanup failure');};
 expect(()=>removeConfirmedUploadedAdvice(db,plan)).toThrow('Synthetic cleanup failure');expect(JSON.stringify(db.tables)).toBe(before);
});
test('incomplete uploaded acknowledgment metadata fails closed before offering cleanup',()=>{
 const db=setup(),row=uploaded(db,'ANMETA');row.postedAt=null;expect(()=>planUploadedAdviceCleanup(db)).toThrow('incomplete');
});
test.each(['orphan','silent-delete-failure'])('removal fails closed without leaving financial residue or deleting unrelated data (%s)',async kind=>{
 const db=setup(),row=add(db,'ANPROTECT');
 if(kind==='orphan')db.tables.AdviceReceiptItem.push({...row.items[0],id:row.receiptNo+'|99',noticeNo:'ANORPHAN'});
 else db.delete=()=>{};
 const before=JSON.stringify(db.tables);
 expect(await postAdviceBatch(db,httpFor([ack(row.receiptNo)]),'https://fixture.invalid',START,END)).toEqual({sent:0,retained:1});expect(JSON.stringify({...db.tables,ReceiptUploadAttempt:[]})).toBe(before);expect(db.objects('ReceiptUploadAttempt').length).toBeGreaterThan(0);
});
