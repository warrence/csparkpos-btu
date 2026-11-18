import {Alert} from 'react-native';
import moment from 'moment';
import {memoryRealm,RULES} from '../test-support/memoryRealm';
import {adviceItem} from '../src/advice/collection';
import {saveAdviceReceipt} from '../src/advice/storage';
import {assertNewAdviceNotices} from '../src/advice/duplicates';
import {adviceReceiptLines} from '../src/advice/receipt';
import {AdviceNoticePayment} from '../src/components/payments/AdviceNoticePayment';
jest.mock('../src/realm',()=>({objects:()=>[]}));
jest.mock('../src/printReceipt',()=>jest.fn());
const rules={...RULES,collectionPolicyVersion:3,feeBasis:'receipt',baseAmount:.8,excessCharges:1,taxPercent:6};
const day=new Date('2026-10-17T04:00:00Z');
const draft=(noticeNo='AN1',city='BTU',noticeDate='2026-10-17')=>({noticeNo,city,noticeDate,carNo:'TESTCAR',baseAmount:'1',excessCharge:'.2',taxRate:'6',taxAmount:'.06'});
let db,alert;
function seed(names=['AN1'],overdue=false,policy=rules,city='BTU'){
 const items=names.map(no=>adviceItem({...draft(no,city,overdue?'2026-09-01':'2026-10-17'),excessCharge:'0.20',taxAmount:'0.06',couponNo:'SYNTHETIC'},policy,overdue));
 const {receiptNo}=saveAdviceReceipt(db,{items,overdue,rules:policy,userName:'FIXTURE',now:day});
 return db.objectForPrimaryKey('AdviceReceiptHeader',receiptNo);
}
function caught(items=[draft()]){try{assertNewAdviceNotices(db,items);}catch(e){return e;}throw Error('Expected duplicate');}
function view(items=[draft()]){const printer={print:jest.fn().mockResolvedValue(true)},v=new AdviceNoticePayment({database:db,authStore:{userName:'FIXTURE'},printer});v.setState=x=>Object.assign(v.state,x);v.state.items=items;return {v,printer};}
const snapshot=()=>JSON.stringify(db.tables);
beforeEach(()=>{db=memoryRealm();db.tables.AdviceRules[0].json=JSON.stringify({protocolVersion:1,configured:true,rules});alert=jest.spyOn(Alert,'alert').mockImplementation(()=>{});});
afterEach(()=>jest.restoreAllMocks());

test.each([false,true])('verified %s overdue AN offers original receipt identity even when draft status/date/vehicle differ',async overdue=>{
 const h=seed(['AN1','AN2'],overdue),before=snapshot(),{v,printer}=view([{...draft(' an1 ',' btu '),carNo:'DRAFTOTHER'}]);v.state.overdue=!overdue;v.state.rules=undefined;v.state.lastReceiptNo='UNRELATED';await v.pay();
 const [title,,buttons]=alert.mock.calls[0];expect(title).toContain(h.receiptNo);expect(title).toContain('TESTCAR');expect(title).not.toContain('DRAFTOTHER');expect(buttons.map(b=>b.text)).toEqual(['Cancel','Reprint']);expect(buttons[0].onPress).toEqual(expect.any(Function));expect(v.state.lastReceiptNo).toBe('UNRELATED');expect(snapshot()).toBe(before);await buttons[1].onPress();expect(printer.print).toHaveBeenCalledWith('an',h.receiptNo);expect(snapshot()).toBe(before);
});

test.each([RULES,{...rules,collectionPolicyVersion:2},rules])('legacy/current archived policy reprints saved lines without current policy validation (%j)',policy=>{
 const h=seed(['AN1','AN2'],true,policy),before=adviceReceiptLines(h);db.tables.AdviceRules=[];const e=caught();expect(e.printKind).toBe('an');e.validateReprint();expect(adviceReceiptLines(h)).toEqual(before);
});

test('new plus duplicate basket makes no partial collection and reprints only original saved receipt',()=>{
 const h=seed(),before=snapshot();expect(()=>saveAdviceReceipt(db,{items:[draft('NEW'),draft('AN1')],overdue:true,rules:{},userName:'FIXTURE'})).toThrow(/local receipt/);expect(snapshot()).toBe(before);expect(caught([draft('NEW'),draft('AN1')]).receiptNo).toBe(h.receiptNo);
});

test('different city is a different business notice identity and retains existing new collection rules',()=>{
 seed();expect(()=>assertNewAdviceNotices(db,[draft('AN1','OTHER')])).not.toThrow();const fresh=seed(['AN1'],false,rules,'OTHER');expect(fresh.city).toBe('OTHER');expect(db.objects('AdviceReceiptHeader')).toHaveLength(2);
});

test('same basket duplicate and notices belonging to different receipts do not choose an arbitrary receipt',()=>{
 seed();expect(caught([draft(),draft()]).receiptNo).toBeUndefined();seed(['AN2']);const e=caught([draft(),draft('AN2')]);expect(e.receiptNo).toBeUndefined();expect(e.message).toMatch(/different saved receipts/);
});

test.each(['orphan','shared','sibling-shared','orphan-prefix','variant','bad-city','bad-payload','bad-rules','bad-total','missing-profile','unknown-status','incomplete','blank-city-orphan','blank-city-sibling'])('%s holds without offering an unverifiable receipt',kind=>{
 const h=seed(['AN1','AN2']);
 if(kind==='blank-city-orphan'||kind==='blank-city-sibling')db.tables.AdviceReceiptItem.push({...h.items[kind==='blank-city-orphan'?0:1],city:'',id:'UNKNOWN|0'});
 if(kind==='orphan')db.tables.AdviceReceiptHeader=[];
 if(kind==='shared'||kind==='sibling-shared')db.tables.AdviceReceiptHeader.push({...h,receiptNo:'OTHER',items:[h.items[kind==='shared'?0:1]]});
 if(kind==='orphan-prefix')db.tables.AdviceReceiptItem.push({...h.items[0],id:h.receiptNo+'|99',noticeNo:'ORPHAN'});
 if(kind==='variant')db.tables.AdviceReceiptItem.push({...h.items[0],id:'OTHER|0',noticeNo:' an1 ',city:' btu '});
 if(kind==='bad-city')h.items[0].city='OTHER';
 if(kind==='bad-payload')h.postingPayload='{}';if(kind==='bad-rules')h.rulesSnapshot='{';if(kind==='bad-total')h.totalAmount+=1;
 if(kind==='missing-profile')db.tables.GeneralProfile=[];if(kind==='unknown-status')h.status='unknown';if(kind==='incomplete')h.userName='';
 const before=snapshot(),e=caught();expect(e.receiptNo).toBeUndefined();expect(e.message).toMatch(/review/);expect(snapshot()).toBe(before);
});

test('posted but fully preserved local receipt reprints without asserting settlement; deleted receipt is never reconstructed',()=>{
 const h=seed();h.status='posted';const e=caught();expect(e.receiptNo).toBe(h.receiptNo);e.validateReprint();db.tables.AdviceReceiptHeader=[];expect(()=>e.validateReprint()).toThrow(/no longer available/);db.tables.AdviceReceiptItem=[];expect(()=>assertNewAdviceNotices(db,[draft()])).not.toThrow();
});

test.each(['header','amount','payload','profile','new-shared-sibling','orphan-sibling','blank-city-after-prompt'])('mutation %s after prompt blocks action and guarded persistent reprint',async kind=>{
 const h=seed(['AN1','AN2']),{v,printer}=view();v.state.lastReceiptNo=h.receiptNo;await v.pay();const button=alert.mock.calls[0][2][1];
 if(kind==='blank-city-after-prompt')db.tables.AdviceReceiptItem.push({...h.items[1],city:'',id:'UNKNOWN|0'});
 if(kind==='header')db.tables.AdviceReceiptHeader=[];if(kind==='amount')h.items[1].baseAmount=12;if(kind==='payload')h.postingPayload='{}';if(kind==='profile')db.tables.GeneralProfile[0].PondokId='OTHER';
 if(kind==='new-shared-sibling')db.tables.AdviceReceiptHeader.push({...h,receiptNo:'OTHER',items:[h.items[1]]});if(kind==='orphan-sibling')db.tables.AdviceReceiptItem.push({...h.items[1],id:'OTHER|1'});
 const before=snapshot();await button.onPress();await v.reprint();expect(printer.print).not.toHaveBeenCalled();expect(snapshot()).toBe(before);expect(v.state.message).toMatch(/Unable/);
});

test('double Pay and repeated Reprint taps do not create receipt or duplicate concurrent printing',async()=>{
 seed();const {v,printer}=view();const before=snapshot();const pay=v.pay();await v.pay();await pay;expect(alert).toHaveBeenCalledTimes(1);let done;printer.print.mockImplementation(()=>new Promise(resolve=>{done=resolve;}));const button=alert.mock.calls[0][2][1];const first=button.onPress();await button.onPress();expect(printer.print).toHaveBeenCalledTimes(1);done();await first;expect(snapshot()).toBe(before);
});

test('failed duplicate printing can retry only the unchanged original receipt',async()=>{
 const h=seed(),{v,printer}=view();await v.pay();const button=alert.mock.calls[0][2][1];printer.print.mockRejectedValueOnce(Error('offline'));await button.onPress();expect(v.state.message).toMatch(/Unable to reprint/);h.items[0].taxAmount+=1;await button.onPress();expect(printer.print).toHaveBeenCalledTimes(1);
});

test('initial saved printer failure retains ordinary saved-state UX; reentry finds original receipt',async()=>{
 const {v,printer}=view([]);v.state.items=[adviceItem(draft('NEW','BTU',moment().format('YYYY-MM-DD')),rules,false)];v.state.overdue=false;printer.print.mockRejectedValueOnce(Error('offline'));await v.pay();expect(v.state.message).toMatch(/is saved.*Printing failed/);expect(v.state.items).toEqual([]);const h=db.objects('AdviceReceiptHeader')[0],before=snapshot();v.state.items=[draft('NEW')];await v.pay();const call=alert.mock.calls.find(c=>Array.isArray(c[2]));expect(call[0]).toContain(h.receiptNo);await call[2][1].onPress();expect(snapshot()).toBe(before);expect(printer.print).toHaveBeenLastCalledWith('an',h.receiptNo);
});

 test('Pay is held while a verified duplicate print is in flight, even if the basket is changed',async()=>{
  seed();const {v,printer}=view();await v.pay();let done;printer.print.mockImplementation(()=>new Promise(resolve=>{done=resolve;}));const button=alert.mock.calls[0][2][1];const printing=button.onPress();const before=snapshot();v.state.items=[adviceItem(draft('FRESH','BTU',moment().format('YYYY-MM-DD')),rules,false)];await v.pay();expect(alert).toHaveBeenCalledTimes(1);expect(snapshot()).toBe(before);expect(printer.print).toHaveBeenCalledTimes(1);done();await printing;
 });
