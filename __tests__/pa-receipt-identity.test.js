import {Alert} from 'react-native';
import {memoryRealm} from '../test-support/memoryRealm';
import {savePaReceipt,assertNewPaNotices,paItems,paReceiptPayload,markPaUploading,markPaUploadResult,paUploadState,latestPaReceipt} from '../src/payments/paReceipts';
import {collectReceipt,reprintSavedReceipt} from '../src/payments/collectReceipt';
const item=no=>({paNo:no,paDate:new Date(2026,9,29),offence:'ARTICLE 8(1)',amount:15,taxAmount:0,tax:0,disAmount:3,disPercent:20,opAmount:0});
const header=(no,type='C',city='Bintulu')=>({receiptNo:no,userName:'FIXTURE',receiptDate:new Date(2026,9,29,12),pondokId:'P1',city,carNo:'FIXTURE',paType:type,reminderNo:''});
const save=(db,no,type='C',city='Bintulu',notice='TEST1')=>{let row;db.write(()=>{row=savePaReceipt(db,header(no,type,city),[item(notice)]);});return row;};
function screen(print=jest.fn().mockResolvedValue(true)){return {state:{data:[item('TEST1')],total:'12',amountReceived:'12',printReceipt:{print}},setState(v){Object.assign(this.state,v);},clearForm(){this.state.data=[];this.state.total=0;}};}
beforeEach(()=>jest.spyOn(Alert,'alert').mockImplementation(()=>{}));afterEach(()=>jest.restoreAllMocks());
test('new lines use technical receipt/position identity; same number in distinct city/type does not collide',()=>{
 const db=memoryRealm();const a=save(db,'PA-P1-1'),b=save(db,'PA-P1-2','O'),c=save(db,'PA-P1-3','C','Other City');
 expect(new Set(db.objects('PaReceiptLine').map(row=>row.id)).size).toBe(3);expect(db.objects('PaReceiptItem')).toHaveLength(0);expect(paItems(a)[0].paNo).toBe(paItems(b)[0].paNo);expect(paItems(c)[0].city).toBe('Other City');
});
test.each(['pending','uploading','uploaded','uncertain'])('genuine duplicate %s shows existing receipt, leaves all financial records unchanged',status=>{
 const db=memoryRealm(),row=save(db,'PA-P1-1');row.status=status;const before=JSON.stringify(db.tables);try{save(db,'PA-P1-2');throw Error('expected rejection');}catch(e){expect(e.receiptNo).toBe('PA-P1-1');expect(e.printKind).toBe('pa');}expect(JSON.stringify(db.tables)).toBe(before);
});
test('compound reminders and OP reminders share their respective paid identities',()=>{for(const[a,b]of[['C','R'],['O','RO']]){const db=memoryRealm();save(db,'PA-P1-1',a);expect(()=>save(db,'PA-P1-2',b)).toThrow('already collected');}});
test('duplicate within one batch rolls back before any header or line persists',()=>{const db=memoryRealm(),before=JSON.stringify(db.tables);expect(()=>db.write(()=>savePaReceipt(db,header('PA-P1-1'),[item('SAME'),item(' same ')]))).toThrow('already in this receipt');expect(JSON.stringify(db.tables)).toBe(before);});
test('legacy linked items remain intact, reprintable and duplicate protected',()=>{
 const db=memoryRealm(),old=item('LEGACY');db.tables.PaReceiptItem=[old];db.tables.PaReceiptHeader=[{...header('OLD1'),items:[old]}];const before=JSON.stringify(db.tables);expect(()=>save(db,'NEW1','C','Bintulu','LEGACY')).toThrow('receipt OLD1');expect(paItems(db.tables.PaReceiptHeader[0])).toEqual([old]);expect(JSON.stringify(db.tables)).toBe(before);
});
test('legacy orphan has no invented receipt/reprint and is never purged or upserted',()=>{
 const db=memoryRealm();db.tables.PaReceiptItem=[item('ORPHAN')];const before=JSON.stringify(db.tables);try{save(db,'NEW1','C','Bintulu','ORPHAN');throw Error('expected');}catch(e){expect(e.message).toContain('no receipt reference');expect(e.receiptNo).toBeUndefined();}expect(JSON.stringify(db.tables)).toBe(before);
});
test('new orphan preserves known city/type and blocks only that identity',()=>{const db=memoryRealm();save(db,'PA-P1-1');db.tables.PaReceiptHeader=[];expect(()=>save(db,'PA-P1-2')).toThrow('no receipt reference');save(db,'PA-P1-3','O');expect(db.objects('PaReceiptLine')).toHaveLength(2);});
test('posting archives headers/items, excludes local metadata from payload, and blocks recollection',()=>{
 const db=memoryRealm(),row=save(db,'PA-P1-1'),before=JSON.stringify(paReceiptPayload(row));markPaUploading(db,[row]);expect(row.status).toBe('uploading');expect(row.uploadPayload).toBe(before);markPaUploadResult(db,[row],true);expect(row.status).toBe('uploaded');expect(JSON.stringify(paReceiptPayload(row))).toBe(before);expect(()=>save(db,'PA-P1-2')).toThrow('receipt PA-P1-1');expect(Object.keys(paReceiptPayload(row).items[0])).not.toContain('id');expect(paItems(row)[0].amount-paItems(row)[0].disAmount).toBe(12);
});
test('timeout/interrupted upload survives restart as unknown, preserving immutable financial data',()=>{
 const db=memoryRealm(),row=save(db,'PA-P1-1');markPaUploading(db,[row]);const reopened=memoryRealm();reopened.tables=JSON.parse(JSON.stringify(db.tables));expect(paUploadState(reopened.tables.PaReceiptHeader[0])).toBe('uploading');expect(()=>save(reopened,'PA-P1-2')).toThrow('already collected');markPaUploadResult(reopened,reopened.tables.PaReceiptHeader,false);expect(reopened.tables.PaReceiptHeader[0].status).toBe('uncertain');expect(latestPaReceipt(reopened,'compound').receiptNo).toBe('PA-P1-1');
});
test('printing failure then re-entering notice offers existing receipt; Cancel/Reprint never saves again',async()=>{
 const db=memoryRealm(),print=jest.fn().mockRejectedValueOnce(Error('Printer disconnected')).mockResolvedValue(true),s=screen(print);
 await collectReceipt(s,db,true,'pa',no=>savePaReceipt(db,header(no),[item('TEST1')]));const first=Alert.alert.mock.calls[0];expect(first[0]).toContain('is saved. Printing failed');expect(s.state.data).toEqual([]);const no=db.objects('PaReceiptHeader')[0].receiptNo;
 s.state.data=[item('TEST1')];s.state.total='12';await collectReceipt(s,db,true,'pa',next=>savePaReceipt(db,header(next),[item('TEST1')]));const dialog=Alert.alert.mock.calls[1];expect(dialog[0]).toContain(no);expect(dialog[0]).not.toContain('Payment was not saved');expect(dialog[2][0].text).toBe('Cancel');expect(dialog[2][0].onPress).toBeUndefined();await dialog[2][1].onPress();expect(print).toHaveBeenLastCalledWith('pa',no);expect(db.objects('PaReceiptHeader')).toHaveLength(1);expect(db.objects('GeneralProfile')[0].PaReceiptNo).toBe(71);
});
test('rapid Save and repeated Reprint taps perform one save and one concurrent print each',async()=>{
 const db=memoryRealm();let finish;const print=jest.fn(()=>new Promise(resolve=>{finish=resolve;})),s=screen(print);const first=collectReceipt(s,db,true,'pa',no=>savePaReceipt(db,header(no),[item('TEST1')]));await collectReceipt(s,db,true,'pa',()=>{throw Error('duplicate');});expect(db.objects('PaReceiptHeader')).toHaveLength(1);finish(true);await first;const one=reprintSavedReceipt(s,'pa','PA-P1-71');await reprintSavedReceipt(s,'pa','PA-P1-71');expect(print).toHaveBeenCalledTimes(2);finish(true);await one;
});
test('printer failure after restart can only reprint the persisted receipt and never mutates totals',async()=>{const db=memoryRealm(),row=save(db,'PA-P1-1'),reopened=memoryRealm();reopened.tables=JSON.parse(JSON.stringify(db.tables));const s=screen();const last=latestPaReceipt(reopened,'compound');await reprintSavedReceipt(s,'pa',last.receiptNo);expect(s.state.printReceipt.print).toHaveBeenCalledWith('pa','PA-P1-1');expect(paItems(last)[0].disAmount).toBe(3);expect(db.objects('PaReceiptHeader')).toHaveLength(1);});
test('migration preserves the existing unposted queue selection without inventing a posted acknowledgement',()=>{const old={...header('LEGACY'),items:[item('OLD')]};expect(paUploadState(old)).toBe('pending');expect(paReceiptPayload(old).items[0].amount).toBe(15);});
test('duplicate dialog repeated Reprint presses share print lock; Cancel never saves or prints',async()=>{
 const db=memoryRealm(),saved=save(db,'PA-P1-1');let done;const print=jest.fn(()=>new Promise(resolve=>{done=resolve;})),s=screen(print);await collectReceipt(s,db,true,'pa',no=>savePaReceipt(db,header(no),[item('TEST1')]));const buttons=Alert.alert.mock.calls[0][2];expect(buttons[0]).toEqual({text:'Cancel',style:'cancel'});expect(print).not.toHaveBeenCalled();const first=buttons[1].onPress();await buttons[1].onPress();expect(print).toHaveBeenCalledTimes(1);done(true);await first;expect(db.objects('PaReceiptHeader')).toHaveLength(1);expect(saved.receiptNo).toBe('PA-P1-1');
});
test('orphan technical lines retain receipt-counter high-water after headers/profile refresh',async()=>{const db=memoryRealm();save(db,'PA-P1-250');db.tables.PaReceiptHeader=[];db.tables.GeneralProfile[0].PaReceiptNo=0;const s=screen();await collectReceipt(s,db,true,'pa',no=>savePaReceipt(db,header(no),[item('FRESHNOTICE')]));expect(db.objects('PaReceiptHeader')[0].receiptNo).toBe('PA-P1-251');expect(db.objects('PaReceiptLine')).toHaveLength(2);});
test.each([{city:''},{paType:''}])('legacy incomplete identity is not treated as a different payable notice: %s',missing=>{const db=memoryRealm(),old=item('LEGACY');db.tables.PaReceiptItem=[old];db.tables.PaReceiptHeader=[{...header('OLD-1'),...missing,items:[old]}];try{save(db,'NEW1','C','Bintulu','LEGACY');throw Error('expected');}catch(e){expect(e.message).toContain('Earlier receipt OLD-1');expect(e.message).toContain('incomplete');expect(e.receiptNo).toBeUndefined();}expect(db.tables.PaReceiptHeader).toHaveLength(1);});
