import {nextReceiptNumber} from '../src/payments/receiptNumbers';
import {assertNoRemovedSale,nextOtherReceiptCounter} from '../src/payments/receiptRemoval';
import {memoryRealm} from '../test-support/memoryRealm';
import {receiptRemovalRows,planReceiptRemoval,removeReviewedReceipts,planReceiptRestore,restoreReviewedReceipt,assertNoRemovedNotice,markAdviceUploadAttempt} from '../src/payments/receiptRemoval';
import {assertNewOpNotices} from '../src/payments/opReceipts';
import {assertNewPaNotices} from '../src/payments/paReceipts';
import {assertNewAdviceNotices} from '../src/advice/duplicates';
const now=new Date('2026-11-10T12:00:00Z');
function setup(){
 const db=memoryRealm(),base={receiptDate:now,city:'BTU',userName:'TEST',pondokId:'P1'};
 const op={opNo:'OPNOTICE',opDate:now,amount:.8,taxAmount:.05,tax:6};
 const pa={id:'PA1:0',receiptNo:'PA1',city:'BTU',noticeKind:'compound',paNo:'PANOTICE',paDate:now,amount:20};
 const an={id:'AN1|0',noticeNo:'ANNOTICE',noticeDate:now,city:'BTU',carNo:'TEST'};
 const coupon={startingCouponNo:'C1',endingCouponNo:'C2',amount:2};
 const mbill={mBillNo:'MB1',amount:1};
 Object.assign(db.tables,{OpReceiptHeader:[{...base,receiptNo:'OP1',items:[op]}],OpReceiptItem:[op],
 PaReceiptHeader:[{...base,receiptNo:'PA1',paType:'C',status:'pending',items:[],lines:[pa]}],PaReceiptLine:[pa],
 AdviceReceiptHeader:[{...base,receiptNo:'AN1',status:'pending',overdue:false,items:[an],postingPayload:JSON.stringify({receiptNo:'AN1'})}],AdviceReceiptItem:[an],
 CouponReceiptHeader:[{...base,receiptNo:'C1',items:[coupon]}],CouponReceiptItem:[coupon],
 MBillReceiptHeader:[{...base,receiptNo:'M1',items:[mbill]}],MBillReceiptItem:[mbill]});
 // Faithful primary keys for the added tables and all receipt detail tables.
 const idFor={ReceiptRemovalArchive:'id',ReceiptUploadAttempt:'id',PaReceiptLine:'id',AdviceReceiptItem:'id',OpReceiptItem:'opNo',PaReceiptItem:'paNo',CouponReceiptItem:'startingCouponNo',MBillReceiptItem:'mBillNo'};
 db.objectForPrimaryKey=function(name,k){const pk=idFor[name]||'receiptNo';return this.objects(name).find(x=>x[pk]===k);};
 db.create=function(name,value,update){const pk=idFor[name]||'receiptNo',existing=this.objectForPrimaryKey(name,value[pk]);if(existing){if(!update)throw Error('Duplicate');Object.assign(existing,value);return existing;}const row={...value};this.objects(name);this.tables[name].push(row);return row;};
 return db;
}
function remove(db,group='all'){const plan=planReceiptRemoval(db,receiptRemovalRows(db,group));removeReviewedReceipts(db,plan,'ADMIN');return plan;}
test('all types removed atomically with exact recoverable snapshots, counters unchanged, no server calls',()=>{
 const db=setup(),counters=JSON.stringify(db.tables.GeneralProfile),plan=remove(db);
 expect(plan.receipts).toHaveLength(5);expect(db.objects('ReceiptRemovalArchive')).toHaveLength(5);
 for(const name of ['OpReceiptHeader','OpReceiptItem','PaReceiptHeader','PaReceiptLine','AdviceReceiptHeader','AdviceReceiptItem','CouponReceiptHeader','CouponReceiptItem','MBillReceiptHeader','MBillReceiptItem'])expect(db.objects(name)).toHaveLength(0);
 expect(JSON.stringify(db.tables.GeneralProfile)).toBe(counters);
 for(const a of [...db.objects('ReceiptRemovalArchive')])restoreReviewedReceipt(db,planReceiptRestore(db,a.id));
 expect(db.objects('ReceiptRemovalArchive')).toHaveLength(0);expect(db.objects('OpReceiptHeader')[0].receiptDate).toEqual(now);expect(db.objects('OpReceiptHeader')[0].items[0].opDate).toEqual(now);
 expect(db.objects('PaReceiptHeader')[0].lines[0]).toBe(db.objects('PaReceiptLine')[0]);expect(db.objects('AdviceReceiptHeader')[0].items[0]).toBe(db.objects('AdviceReceiptItem')[0]);
});
test('OP group includes current AN; PA group includes overdue AN and PA, without deleting other group',()=>{
 const db=setup();expect(receiptRemovalRows(db,'op').map(x=>x.kind)).toEqual(['an','op']);
 db.tables.AdviceReceiptHeader[0].overdue=true;expect(receiptRemovalRows(db,'pa').map(x=>x.kind)).toEqual(['an','pa']);remove(db,'pa');expect(db.objects('OpReceiptHeader')).toHaveLength(1);
});
test.each(['uncertain','uploading','legacy-review','unknown'])('PA %s blocked without changes',status=>{const db=setup();db.tables.PaReceiptHeader[0].status=status;expect(()=>remove(db)).toThrow(/unknown outcome/);expect(db.objects('ReceiptRemovalArchive')).toHaveLength(0);});
test('unresolved outbox, even malformed, blocks both removal and restore',()=>{const db=setup();remove(db,'op');const a=db.objects('ReceiptRemovalArchive')[0];db.tables.LegacyPostingOutbox=[{id:'pending',payload:'broken'}];expect(()=>remove(db,'pa')).toThrow(/unresolved/);expect(()=>planReceiptRestore(db,a.id)).toThrow(/unresolved/);});
test('durable AN attempt blocks removal even after cold restart or timeout',()=>{const db=setup();markAdviceUploadAttempt(db,[{receiptNo:'AN1'}]);expect(()=>remove(db,'op')).toThrow(/may already/);expect(db.objects('AdviceReceiptHeader')).toHaveLength(1);});
test('changed record after confirmation rejects entire batch',()=>{const db=setup(),plan=planReceiptRemoval(db,receiptRemovalRows(db,'all'));db.tables.OpReceiptItem[0].amount=9;expect(()=>removeReviewedReceipts(db,plan,'ADMIN')).toThrow(/changed/);expect(db.objects('ReceiptRemovalArchive')).toHaveLength(0);expect(db.objects('PaReceiptHeader')).toHaveLength(1);});
test('new upload begun during confirmation blocks deletion',()=>{const db=setup(),plan=planReceiptRemoval(db,receiptRemovalRows(db,'all'));markAdviceUploadAttempt(db,[{receiptNo:'AN1'}]);expect(()=>removeReviewedReceipts(db,plan,'ADMIN')).toThrow(/may already/);});
test('shared details rejected, orphan legacy records never swept away',()=>{const db=setup();db.tables.OpReceiptItem.push({opNo:'ORPHAN'});remove(db,'op');expect(db.objects('OpReceiptItem')).toEqual([{opNo:'ORPHAN'}]);const other=setup();other.tables.OpReceiptHeader.push({...other.tables.OpReceiptHeader[0],receiptNo:'OTHER'});expect(()=>remove(other,'op')).toThrow(/shared/);});
test('unlinked scoped PA/AN detail blocks removal',()=>{const db=setup();db.tables.PaReceiptLine.push({id:'PA1:1',receiptNo:'PA1'});expect(()=>remove(db,'pa')).toThrow(/unlinked/);});
test('archive write failure rolls entire deletion back',()=>{const db=setup(),before=JSON.stringify(db.tables),original=db.create.bind(db);db.create=(name,value,...args)=>{if(name==='ReceiptRemovalArchive'&&value.kind==='op')throw Error('disk');return original(name,value,...args);};expect(()=>remove(db)).toThrow('disk');expect(JSON.stringify(db.tables).includes('OPNOTICE')).toBe(true);expect(db.objects('ReceiptRemovalArchive')).toHaveLength(0);expect(db.objects('PaReceiptHeader')).toHaveLength(1);});
test('removed identities remain duplicate-protected for OP PA AN',()=>{const db=setup();remove(db);expect(()=>assertNewOpNotices(db,'BTU',[{opNo:'OPNOTICE'}])).toThrow(/locally removed/);expect(()=>assertNewPaNotices(db,{city:'BTU',paType:'C'},[{paNo:'PANOTICE'}])).toThrow(/locally removed/);expect(()=>assertNewAdviceNotices(db,[{city:'BTU',noticeNo:'ANNOTICE'}])).toThrow(/locally removed/);});
test('restore will not overwrite a newly active or orphan receipt/detail',()=>{const db=setup();remove(db,'op');const a=db.objects('ReceiptRemovalArchive').find(x=>x.kind==='op');db.tables.OpReceiptItem.push({opNo:'OPNOTICE'});expect(()=>planReceiptRestore(db,a.id)).toThrow(/already exists/);expect(db.objects('ReceiptRemovalArchive')).toHaveLength(2);});
test('restore preserves uploaded history and does not reset it to pending',()=>{const db=setup();db.tables.PaReceiptHeader[0].status='uploaded';db.tables.PaReceiptHeader[0].uploadedAt=now;remove(db,'pa');const a=db.objects('ReceiptRemovalArchive')[0];restoreReviewedReceipt(db,planReceiptRestore(db,a.id));expect(db.objects('PaReceiptHeader')[0].status).toBe('uploaded');expect(db.objects('PaReceiptHeader')[0].uploadedAt).toEqual(now);});

test('all archived receipt number series retain high-water; removed bill/coupon duplicates remain blocked',()=>{
 const db=setup();db.tables.OpReceiptHeader[0].receiptNo='OP-P1-90';db.tables.CouponReceiptHeader[0].receiptNo='CP-P1-90';db.tables.MBillReceiptHeader[0].receiptNo='MB-P1-90';
 remove(db);const profile={...db.tables.GeneralProfile[0],CouponReceiptPrefix:'CP',CouponReceiptNo:0,MBillReceiptPrefix:'MB',MBillReceiptNo:0};
 expect(nextReceiptNumber(db,profile,false).next).toBe(91);expect(nextOtherReceiptCounter(db,profile,'coupon')).toBe(91);expect(nextOtherReceiptCounter(db,profile,'mbill')).toBe(91);
 expect(()=>assertNoRemovedSale(db,'mbill','BTU',[{mBillNo:'MB1'}])).toThrow(/locally removed/);
 expect(()=>assertNoRemovedSale(db,'coupon',null,[{startingCouponNo:'C2',endingCouponNo:'C9'}])).toThrow(/locally removed/);
});

// Automatic cleanup never guesses acceptance from pending/unknown records.
import {archiveConfirmedUpload,cleanupPreviouslyUploaded} from '../src/payments/receiptRemoval';
function uploadedFixtures(db) {
 const pa=db.tables.PaReceiptHeader[0],an=db.tables.AdviceReceiptHeader[0];
 pa.status='uploaded';pa.uploadedAt=now;pa.uploadPayload=JSON.stringify({receiptNo:pa.receiptNo});
 an.status='posted';an.postedAt=now;
 return {pa,an};
}
test('historical PA stays for reconciliation while acknowledged posted AN leaves active lists',()=>{
 const db=setup();uploadedFixtures(db);const counters=JSON.stringify(db.tables.GeneralProfile);
 expect(cleanupPreviouslyUploaded(db)).toEqual({removed:1,held:1});
 expect(db.objects('PaReceiptHeader')).toHaveLength(1);expect(db.objects('AdviceReceiptHeader')).toHaveLength(0);
 expect(db.objects('OpReceiptHeader')).toHaveLength(1);expect(db.objects('MBillReceiptHeader')).toHaveLength(1);
 expect(db.objects('ReceiptRemovalArchive')).toHaveLength(1);expect(JSON.stringify(db.tables.GeneralProfile)).toBe(counters);
 db.objects('ReceiptRemovalArchive').forEach(a=>expect(()=>planReceiptRestore(db,a.id)).toThrow(/upload queue/));
 expect(cleanupPreviouslyUploaded(db)).toEqual({removed:0,held:1});
});
test.each(['pending','uncertain','uploading','legacy-review'])('automatic sweep retains PA %s without reclassifying or posting',status=>{
 const db=setup();db.tables.PaReceiptHeader[0].status=status;db.objects('LegacyPostingOutbox');const before=JSON.stringify(db.tables);
 expect(cleanupPreviouslyUploaded(db)).toEqual({removed:0,held:0});expect(JSON.stringify(db.tables)).toBe(before);
});
test('historical flags without valid timestamp/payload evidence stay active for review',()=>{
 const db=setup();uploadedFixtures(db);db.tables.PaReceiptHeader[0].uploadPayload='bad';db.tables.AdviceReceiptHeader[0].postedAt=null;
 expect(cleanupPreviouslyUploaded(db)).toEqual({removed:0,held:2});expect(db.objects('ReceiptRemovalArchive')).toHaveLength(0);
});
test('saved unresolved outbox or known AN attempt prevents historical sweep',()=>{
 const db=setup();uploadedFixtures(db);db.tables.LegacyPostingOutbox=[{id:'pending',payload:'bad'}];expect(cleanupPreviouslyUploaded(db)).toEqual({removed:0,held:0});
 db.tables.LegacyPostingOutbox=[];db.tables.ReceiptUploadAttempt=[{id:JSON.stringify(['an','AN1']),receiptNo:'AN1'}];
 expect(cleanupPreviouslyUploaded(db)).toEqual({removed:0,held:2});expect(db.objects('AdviceReceiptHeader')).toHaveLength(1);
});
test('unknown historical uploaded PA type keeps fail-closed evidence for both compound and OP collection',()=>{
 const db=setup();uploadedFixtures(db);db.tables.PaReceiptHeader[0].paType='UNKNOWN';
 remove(db,'pa'); // Explicit recoverable manual removal, never automatic acceptance inference.
 const a=db.objects('ReceiptRemovalArchive').find(x=>x.kind==='pa'),row=JSON.parse(a.payload),notice=row.lines[0].paNo;
 ['compound','op'].forEach(kind=>expect(()=>assertNoRemovedNotice(db,kind,row.city,notice)).toThrow(/do not collect again/));
});
test('atomic confirmed archive failure retains whole live receipt and no partial history',()=>{
 const db=setup(),before=JSON.stringify(db.tables),del=db.delete.bind(db);db.delete=x=>{del(x);throw Error('disk');};
 expect(()=>db.write(()=>archiveConfirmedUpload(db,'op',db.tables.OpReceiptHeader[0]))).toThrow('disk');
 expect(JSON.stringify(db.tables)).toBe(before);
});

import {paUploadLabel} from '../src/payments/paReceipts';
test('old PA false-success HTTP200 marker with valid timestamp/payload is retained exactly without confirmed archive',()=>{
 const db=setup();uploadedFixtures(db);db.tables.AdviceReceiptHeader[0].status='pending';db.objects('LegacyPostingOutbox');
 const before=JSON.stringify(db.tables);
 expect(cleanupPreviouslyUploaded(db)).toEqual({removed:0,held:1});expect(JSON.stringify(db.tables)).toBe(before);
 expect(db.objects('PaReceiptHeader')[0].status).toBe('uploaded');expect(db.objects('ReceiptRemovalArchive')).toHaveLength(0);
 expect(paUploadLabel(db.objects('PaReceiptHeader')[0])).toBe('Previously marked uploaded - verify with Office');
});
