import moment from 'moment';
import {memoryRealm} from '../test-support/memoryRealm';
import {adviceItem} from '../src/advice/collection';
import {saveAdviceReceipt} from '../src/advice/storage';
import {advicePayload,acknowledgedAdvice,postAdviceBatch} from '../src/advice/payload';
import {adviceReceiptLines} from '../src/advice/receipt';
const rules={calendarDays:14,overdueFee:20,taxEnabled:true,taxPercent:6,windowIncludesCollectionDate:true,
 rounding:'nearest_0.05_on_notice_net_and_tax',collectionPolicyVersion:3,feeBasis:'receipt',baseAmount:0.8,excessCharges:1,reminderNoSupported:true};
function setup(reminderNo,overdue=false,configured=rules){
 const db=memoryRealm();db.tables.AdviceRules[0].json=JSON.stringify({protocolVersion:1,configured:true,rules:configured});
 const item=adviceItem({noticeNo:'ANFIX1',city:'BTU',carNo:'TESTCAR',noticeDate:moment().subtract(overdue?15:0,'days').format('YYYY-MM-DD')},configured,overdue);
 const save=()=>saveAdviceReceipt(db,{items:[item],overdue,userName:'FIXTURE',rules:configured,reminderNo});
 return {db,save};
}
for(const overdue of [false,true]){
 test.each([undefined,null,'','   '])(`blank reminder preserves old payload shape, overdue=${overdue} (%j)`,value=>{
  const {db,save}=setup(value,overdue);save();const receipt=db.objects('AdviceReceiptHeader')[0];
  expect(receipt.reminderNo).toBeNull();expect(JSON.parse(receipt.postingPayload)).not.toHaveProperty('reminderNo');
  expect(advicePayload({...receipt,reminderNo:undefined})).toEqual(JSON.parse(receipt.postingPayload));
 });
 test.each(['000123','0',' REM0007 ','12345678901234567890'])(`populated reminder persists without altering amounts/receipt print, overdue=${overdue} (%j)`,value=>{
  const {db,save}=setup(value,overdue);save();const receipt=db.objects('AdviceReceiptHeader')[0];
  expect(receipt.reminderNo).toBe(value.trim());expect(JSON.parse(receipt.postingPayload).reminderNo).toBe(value.trim());
  expect(receipt.totalAmount).toBe(overdue?21.85:1.85);
  expect(adviceReceiptLines(receipt)).toEqual(adviceReceiptLines({...receipt,reminderNo:null}));
  expect(adviceReceiptLines(receipt).join('\n')).not.toContain('Reminder');
 });
}
test.each(['123456789012345678901',123])('invalid reminder %j never creates a receipt or increments counters',value=>{
 const {db,save}=setup(value);expect(save).toThrow('Reminder number');expect(db.objects('AdviceReceiptHeader')).toHaveLength(0);expect(db.objects('GeneralProfile')[0].OpReceiptNo).toBe(40);
});
test.each([undefined,false,'true'])('nonempty reminder requires explicit boolean office support (%j)',flag=>{
 const {db,save}=setup('REM0001',false,{...rules,reminderNoSupported:flag});expect(save).toThrow('updated office settings');expect(db.objects('AdviceReceiptHeader')).toHaveLength(0);
});
const dates=()=>[moment().startOf('day').toDate(),moment().add(1,'day').startOf('day').toDate()];
test('populated pending reminders are not sent to an office without capability',async()=>{
 const {db,save}=setup('REM0001');save();const receipt=db.objects('AdviceReceiptHeader')[0],original=receipt.postingPayload;
 db.tables.AdviceRules[0].json=JSON.stringify({protocolVersion:1,configured:true,rules:{...rules,reminderNoSupported:undefined}});
 const http={post:jest.fn()};expect(await postAdviceBatch(db,http,'http://fixture.invalid',...dates())).toEqual({sent:0,retained:1});
 expect(http.post).not.toHaveBeenCalled();expect(receipt.postingPayload).toBe(original);expect(receipt.status).toBe('pending');
});
test.each(['accepted','already_received'])('exact reminder echo permits durable %s acknowledgment',async status=>{
 const {db,save}=setup('0');save();const receipt=db.objects('AdviceReceiptHeader')[0];
 const http={post:jest.fn().mockResolvedValue({data:{protocolVersion:1,receipts:[{receiptNo:receipt.receiptNo,status,staged:true,errors:[],reminderNo:'0'}]}})};
 expect(await postAdviceBatch(db,http,'http://fixture.invalid',...dates())).toEqual({sent:1,retained:0});
 expect(http.post.mock.calls[0][1].adviceReceipts[0].reminderNo).toBe('0');expect(db.objectForPrimaryKey('AdviceReceiptHeader',receipt.receiptNo)).toBeUndefined();expect(db.objects('AdviceReceiptItem')).toHaveLength(0);
});
test.each([undefined,'','OTHER',0])('missing/different reminder echo %j keeps immutable receipt pending',async echo=>{
 const {db,save}=setup('0');save();const receipt=db.objects('AdviceReceiptHeader')[0],original=receipt.postingPayload;
 const response={protocolVersion:1,receipts:[{receiptNo:receipt.receiptNo,status:'accepted',staged:true,errors:[],reminderNo:echo}]};
 expect(acknowledgedAdvice(response,[JSON.parse(original)])).toEqual([]);
 expect(await postAdviceBatch(db,{post:jest.fn().mockResolvedValue({data:response})},'http://fixture.invalid',...dates())).toEqual({sent:0,retained:1});
 expect(receipt.status).toBe('pending');expect(receipt.postingPayload).toBe(original);
});
test('blank reminders keep legacy acknowledgment compatibility without echo',async()=>{
 const {db,save}=setup('');save();const receipt=db.objects('AdviceReceiptHeader')[0];
 const http={post:jest.fn().mockResolvedValue({data:{protocolVersion:1,receipts:[{receiptNo:receipt.receiptNo,status:'accepted',staged:true,errors:[]}]}})};
 expect(await postAdviceBatch(db,http,'http://fixture.invalid',...dates())).toEqual({sent:1,retained:0});
 expect(http.post.mock.calls[0][1].adviceReceipts[0]).not.toHaveProperty('reminderNo');
});
