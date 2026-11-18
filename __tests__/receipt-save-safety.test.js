import {Alert} from 'react-native';
import {collectReceipt} from '../src/payments/collectReceipt';
import {saveAdviceReceipt} from '../src/advice/storage';
import {adviceItem} from '../src/advice/collection';
import {memoryRealm, RULES} from '../test-support/memoryRealm';
import moment from 'moment';

function screen(print = jest.fn().mockResolvedValue(true)) {
  return {state: {data: [{}], total: '1.00', amountReceived: '2', printReceipt: {print}},
    setState(value) {Object.assign(this.state, value);},
    clearForm() {this.state.data = [];this.state.amountReceived = '';}};
}
const insert = (db, type) => receiptNo => db.create(type, {receiptNo, items: []});
beforeEach(() => jest.spyOn(Alert, 'alert').mockImplementation(() => {}));
afterEach(() => jest.restoreAllMocks());

test.each([[false,'OpReceiptHeader','OP',40],[true,'PaReceiptHeader','PA',70]])('stale counter allocates above ordinary AND advice high-water: %s', async (overdue,type,prefix,base) => {
  const db=memoryRealm();db.tables.GeneralProfile[0][overdue?'PaReceiptNo':'OpReceiptNo']=0;
  db.tables[type]=[{receiptNo:`${prefix}-P1-${base+1}`,items:[],immutable:'old'}];
  db.tables.AdviceReceiptHeader=[{receiptNo:`${prefix}-P1-${base+5}`,postingPayload:'DO NOT CHANGE'}];
  const old=JSON.stringify(db.tables[type]), advice=JSON.stringify(db.tables.AdviceReceiptHeader);
  const s=screen();
  await collectReceipt(s,db,overdue,overdue?'pa':'op',insert(db,type));
  expect(s.state.reprintReceiptNo).toBe(`${prefix}-P1-${base+6}`);
  expect(JSON.stringify(db.tables[type].slice(0,1))).toBe(old);
  expect(JSON.stringify(db.tables.AdviceReceiptHeader)).toBe(advice);
  expect(s.state.printReceipt.print).toHaveBeenCalledWith(overdue?'pa':'op',`${prefix}-P1-${base+6}`);
});

test('sequential ordinary and AN collections share one atomic series', async () => {
  const db=memoryRealm();await collectReceipt(screen(),db,false,'op',insert(db,'OpReceiptHeader'));
  const item=adviceItem({noticeNo:'ANFIX1',noticeDate:moment().format('YYYY-MM-DD'),city:'BTU',carNo:'TESTCAR',baseAmount:'1',excessCharge:'0',taxRate:'0',taxAmount:'0'},RULES,false);
  const advice=saveAdviceReceipt(db,{items:[item],overdue:false,userName:'FIXTURE',amountReceived:'1',rules:RULES});
  expect(advice.receiptNo).toBe('OP-P1-42');
  const s=screen();await collectReceipt(s,db,false,'op',insert(db,'OpReceiptHeader'));
  expect(s.state.reprintReceiptNo).toBe('OP-P1-43');
});

test('rapid duplicate calls while printer is pending commit and print once', async () => {
  const db=memoryRealm();let done;const s=screen(jest.fn(()=>new Promise(resolve=>{done=resolve;})));
  const first=collectReceipt(s,db,true,'pa',insert(db,'PaReceiptHeader'));
  await collectReceipt(s,db,true,'pa',insert(db,'PaReceiptHeader'));
  expect(db.objects('PaReceiptHeader')).toHaveLength(1);expect(s._saving).toBe(true);
  expect(s.state.printReceipt.print).toHaveBeenCalledTimes(1);done(true);await first;
  expect(s._saving).toBe(false);
});

test('rollback after insertion preserves counter/basket and never prints', async () => {
  const db=memoryRealm(),s=screen(),before=JSON.stringify(db.tables);
  await collectReceipt(s,db,true,'pa',no=>{insert(db,'PaReceiptHeader')(no);throw new Error('fixture disk failure');});
  expect(JSON.stringify(db.tables)).toBe(before);expect(s.state.data).toHaveLength(1);
  expect(s.state.printReceipt.print).not.toHaveBeenCalled();expect(Alert.alert).toHaveBeenCalledWith(expect.stringContaining('not saved'));
});

test('commit failure is not reported as saved and never prints', async () => {
  const db=memoryRealm(),s=screen(),write=db.write.bind(db);
  db.write=cb=>write(()=>{cb();throw new Error('commit failed');});
  await collectReceipt(s,db,true,'pa',insert(db,'PaReceiptHeader'));
  expect(db.objects('PaReceiptHeader')).toHaveLength(0);expect(s.state.printReceipt.print).not.toHaveBeenCalled();
  expect(Alert.alert).toHaveBeenCalledWith(expect.stringContaining('not saved'));
});

test('printing starts after write returns, and failure retains saved receipt without recollection', async () => {
  const db=memoryRealm();let writing=false;const write=db.write.bind(db);
  db.write=cb=>{writing=true;try{return write(cb);}finally{writing=false;}};
  const s=screen(jest.fn(()=>{expect(writing).toBe(false);expect(db.objects('PaReceiptHeader')).toHaveLength(1);return Promise.reject(new Error('printer offline'));}));
  await collectReceipt(s,db,true,'pa',insert(db,'PaReceiptHeader'));
  expect(s.state.data).toHaveLength(0);expect(s.state.reprintReceiptNo).toBe('PA-P1-71');
  expect(Alert.alert).toHaveBeenCalledWith(expect.stringContaining('is saved. Printing failed'),expect.any(String),expect.arrayContaining([expect.objectContaining({text:'Reprint'})]));
  await collectReceipt(s,db,true,'pa',insert(db,'PaReceiptHeader'));
  expect(db.objects('PaReceiptHeader')).toHaveLength(1);expect(s.state.printReceipt.print).toHaveBeenCalledTimes(1);
});

test('invalid counter or insufficient cash retains basket and produces a recoverable error', async () => {
  const db=memoryRealm(),s=screen();db.tables.GeneralProfile[0].PaReceiptNo=-1;
  await collectReceipt(s,db,true,'pa',insert(db,'PaReceiptHeader'));
  expect(db.objects('PaReceiptHeader')).toHaveLength(0);expect(s.state.data).toHaveLength(1);
  db.tables.GeneralProfile[0].PaReceiptNo=70;s.state.amountReceived='0.50';
  await collectReceipt(s,db,true,'pa',insert(db,'PaReceiptHeader'));
  expect(db.objects('PaReceiptHeader')).toHaveLength(0);expect(s.state.printReceipt.print).not.toHaveBeenCalled();
});
