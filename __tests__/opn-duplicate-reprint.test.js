import {Alert} from 'react-native';
import {assertNewOpNotices} from '../src/payments/opReceipts';
import {collectReceipt} from '../src/payments/collectReceipt';
import {memoryRealm} from '../test-support/memoryRealm';
const date=new Date('2026-10-06T04:00:00Z');
const item=(opNo='OP-ONE')=>({opNo,opDate:date,amount:.8,taxAmount:.05,tax:6,carNo:'TEST'});
const header=(receiptNo='OP-P1-41',items=[item()],city='BTU')=>({receiptNo,items,city,userName:'FIXTURE',pondokId:'P1',receiptDate:date,carNo:'TEST',taxPolicyVersion:3});
let db;
function add(row){db.tables.OpReceiptHeader.push(row);db.tables.OpReceiptItem.push(...row.items);return row;}
function check(items=[item()],city='BTU'){return assertNewOpNotices(db,city,items);}
function failure(fn){try{fn();throw Error('expected blocked');}catch(e){return e;}}
function screen(print=jest.fn().mockResolvedValue(true)){return {state:{data:[item()],total:'0.85',amountReceived:'',printReceipt:{print}},setState(v){Object.assign(this.state,v);},clearForm(){this.state.data=[];}};}
async function collect(s){return collectReceipt(s,db,false,'op',no=>{check(s.state.data);add(header(no,s.state.data));});}
beforeEach(()=>{db=memoryRealm();db.tables.OpReceiptHeader=[];db.tables.OpReceiptItem=[];jest.spyOn(Alert,'alert').mockImplementation(()=>{});});
afterEach(()=>jest.restoreAllMocks());

test('fresh normal notices pass without creating or changing records',()=>{const before=JSON.stringify(db.tables);check([item('FRESH')]);expect(JSON.stringify(db.tables)).toBe(before);});

test('one exact saved receipt is identified and Cancel/Reprint never saves or advances counter',async()=>{
 const row=add(header()),before=JSON.stringify(db.tables),s=screen();await collect(s);
 expect(JSON.stringify(db.tables)).toBe(before);expect(s.state.data).toHaveLength(1);expect(s.state.reprintReceiptNo).toBe(row.receiptNo);
 const [message,prompt,buttons]=Alert.alert.mock.calls[0];expect(message).toContain(row.receiptNo);expect(message).toContain('No new receipt was saved');expect(message).not.toContain('already paid');expect(prompt).toContain('without collecting payment again');expect(buttons[0]).toEqual({text:'Cancel',style:'cancel'});expect(s.state.printReceipt.print).not.toHaveBeenCalled();
 await buttons[1].onPress();expect(s.state.printReceipt.print).toHaveBeenCalledWith('op',row.receiptNo);expect(JSON.stringify(db.tables)).toBe(before);
});

test('multiple duplicate items from one saved receipt and fresh basket items block all new saves but reprint original once',async()=>{
 add(header('OP-P1-41',[item('A'),item('B')]));const s=screen();s.state.data=[item('A'),item('NEW'),item('B')];const before=JSON.stringify(db.tables);await collect(s);expect(JSON.stringify(db.tables)).toBe(before);expect(s.state.data).toHaveLength(3);await Alert.alert.mock.calls[0][2][1].onPress();expect(s.state.printReceipt.print).toHaveBeenCalledTimes(1);expect(s.state.printReceipt.print).toHaveBeenCalledWith('op','OP-P1-41');
});

test('case/outer-space normalizations identify same saved notice and city without rewriting either',()=>{add(header());const before=JSON.stringify(db.tables);const e=failure(()=>check([item(' op-one ')],' btu '));expect(e.receiptNo).toBe('OP-P1-41');expect(JSON.stringify(db.tables)).toBe(before);});

test('multiple distinct original receipts never choose one arbitrarily or partially collect fresh items',async()=>{
 add(header('R1',[item('A')]));add(header('R2',[item('B')]));const s=screen();s.state.data=[item('A'),item('FRESH'),item('B')];const before=JSON.stringify(db.tables);await collect(s);expect(JSON.stringify(db.tables)).toBe(before);expect(Alert.alert.mock.calls[0][0]).toContain('different saved receipts: R1, R2');expect(Alert.alert.mock.calls[0][2]).toBeUndefined();expect(s.state.printReceipt.print).not.toHaveBeenCalled();
});

test.each(['orphan','posted-header-removed','cross-city','missing-city','ambiguous-header','orphan-case-variant','incomplete-other-item'])('%s is held for Office review with no invented receipt/reprint',mode=>{
 const r=add(header());if(mode==='orphan'||mode==='posted-header-removed')db.tables.OpReceiptHeader=[];
 if(mode==='cross-city')r.city='OTHER';if(mode==='missing-city')r.city='';if(mode==='ambiguous-header')db.tables.OpReceiptHeader.push(header('OTHER',[r.items[0]]));
 if(mode==='orphan-case-variant')db.tables.OpReceiptItem.push(item(' op-one '));if(mode==='incomplete-other-item')r.items.push({...item('OTHER'),amount:NaN});
 const before=JSON.stringify(db.tables),e=failure(()=>check());expect(e.receiptNo).toBeUndefined();expect(e.message).toContain('ask the office to review');expect(JSON.stringify(db.tables)).toBe(before);
});

test('an orphan in a multi-notice basket overrides an otherwise valid receipt candidate',()=>{add(header());db.tables.OpReceiptItem.push(item('ORPHAN'));const e=failure(()=>check([item(),item('ORPHAN')]));expect(e.receiptNo).toBeUndefined();expect(e.message).toContain('no receipt reference');});

test('normal basket duplicates are rejected before any collection',()=>{const e=failure(()=>check([item('Same'),item(' same ')]));expect(e.receiptNo).toBeUndefined();expect(e.message).toContain('more than once');expect(db.tables.OpReceiptHeader).toHaveLength(0);});

test.each(['deleted','changed-money','new-ambiguous-link'])('saved receipt %s after prompt is revalidated before reprinting',async mode=>{
 const r=add(header()),s=screen();await collect(s);const button=Alert.alert.mock.calls[0][2][1];
 if(mode==='deleted')db.tables.OpReceiptHeader=[];if(mode==='changed-money')db.tables.OpReceiptHeader[0].items[0].amount=99;
 if(mode==='new-ambiguous-link')db.tables.OpReceiptHeader.push(header('OTHER',[db.tables.OpReceiptHeader[0].items[0]]));
 await button.onPress();expect(s.state.printReceipt.print).not.toHaveBeenCalled();expect(Alert.alert.mock.calls[1][0]).toContain('Unable to reprint receipt');expect(Alert.alert.mock.calls[1][0]).toContain('review');
});

test('offline printer failure on duplicate keeps saved receipt and allows later print without collecting',async()=>{
 add(header());const print=jest.fn().mockRejectedValueOnce(Error('Printer is not connected.')).mockResolvedValue(true),s=screen(print),before=JSON.stringify(db.tables);await collect(s);const button=Alert.alert.mock.calls[0][2][1];await button.onPress();expect(Alert.alert.mock.calls[1][0]).toContain('Printer is not connected');expect(JSON.stringify(db.tables)).toBe(before);await button.onPress();expect(print).toHaveBeenCalledTimes(2);expect(JSON.stringify(db.tables)).toBe(before);
});

test('fresh save then printer failure and later duplicate re-entry use the exact original receipt, no second collection',async()=>{
 const print=jest.fn().mockRejectedValueOnce(Error('offline')).mockResolvedValue(true),s=screen(print);await collect(s);const no=db.tables.OpReceiptHeader[0].receiptNo,before=JSON.stringify(db.tables);expect(Alert.alert.mock.calls[0][0]).toContain('is saved. Printing failed');s.state.data=[item()];await collect(s);await Alert.alert.mock.calls[1][2][1].onPress();expect(print).toHaveBeenLastCalledWith('op',no);expect(JSON.stringify(db.tables)).toBe(before);
});

test('repeated duplicate Reprint taps share print lock and never collect',async()=>{
 add(header());let done;const print=jest.fn(()=>new Promise(resolve=>{done=resolve;})),s=screen(print);await collect(s);const button=Alert.alert.mock.calls[0][2][1];const first=button.onPress();await button.onPress();expect(print).toHaveBeenCalledTimes(1);done(true);await first;expect(db.tables.GeneralProfile[0].OpReceiptNo).toBe(40);expect(db.tables.OpReceiptHeader).toHaveLength(1);
});

test('matching legacy tax is reprintable without rewriting its historical policy',()=>{const r=add(header());delete r.taxPolicyVersion;db.tables.GeneralProfile[0].Tax=6;const e=failure(()=>check());expect(e.receiptNo).toBe(r.receiptNo);expect(()=>e.validateReprint()).not.toThrow();expect(r.taxPolicyVersion).toBeUndefined();});
test.each(['tax','pondok','unknown-policy'])('incompatible %s printing context never offers an unsafe historical reprint',mode=>{const r=add(header());if(mode==='tax'){delete r.taxPolicyVersion;db.tables.GeneralProfile[0].Tax=0;}if(mode==='pondok')db.tables.GeneralProfile[0].PondokId='OTHER';if(mode==='unknown-policy')r.taxPolicyVersion=999;const e=failure(()=>check());expect(e.receiptNo).toBeUndefined();expect(e.message).toContain('review');});
test.each(['tax','pondok','orphan-variant'])('changed %s context after prompt is held before printing',async mode=>{const r=add(header());delete r.taxPolicyVersion;db.tables.GeneralProfile[0].Tax=6;const s=screen();await collect(s);if(mode==='tax')db.tables.GeneralProfile[0].Tax=0;if(mode==='pondok')db.tables.GeneralProfile[0].PondokId='OTHER';if(mode==='orphan-variant')db.tables.OpReceiptItem.push(item('op-one'));await Alert.alert.mock.calls[0][2][1].onPress();expect(s.state.printReceipt.print).not.toHaveBeenCalled();expect(Alert.alert.mock.calls[1][0]).toContain('review');});

test.each(['shared-header','orphan-case'])('ambiguous %s sibling in the original receipt prevents offer even when that sibling is not in the new basket',mode=>{const r=add(header('R1',[item('A'),item('B')]));if(mode==='shared-header')db.tables.OpReceiptHeader.push(header('R2',[r.items[1]]));else db.tables.OpReceiptItem.push(item('b'));const e=failure(()=>check([item('A')]));expect(e.receiptNo).toBeUndefined();expect(e.message).toContain('notice links');});
test.each(['shared-header','orphan-case'])('sibling %s ambiguity created after prompt is held before printing original receipt',async mode=>{add(header('R1',[item('A'),item('B')]));const s=screen();s.state.data=[item('A')];await collect(s);const r=db.tables.OpReceiptHeader[0];if(mode==='shared-header')db.tables.OpReceiptHeader.push(header('R2',[r.items[1]]));else db.tables.OpReceiptItem.push(item('b'));await Alert.alert.mock.calls[0][2][1].onPress();expect(s.state.printReceipt.print).not.toHaveBeenCalled();expect(Alert.alert.mock.calls[1][0]).toContain('notice links');});
