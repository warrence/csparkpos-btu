import {memoryRealm, RULES} from '../test-support/memoryRealm';
import {adviceItem} from '../src/advice/collection';
import {saveAdviceReceipt} from '../src/advice/storage';
let mockDatabase;
jest.mock('../src/realm', () => ({
  objects: type => mockDatabase.objects(type),
  objectForPrimaryKey: (type, id) => mockDatabase.objectForPrimaryKey(type, id),
}));
jest.mock('react-native-bluetooth-serial', () => ({write: jest.fn(() => Promise.resolve(true)), isConnected: jest.fn(() => Promise.resolve(true))}));
const PrintReceipt = require('../src/printReceipt').default;
const PrintClosing = require('../src/printClosing').default;
const Bluetooth = require('react-native-bluetooth-serial');

function expectWithinPrintHead(buffer) {
  let dots=0,mode=0;
  for(let i=0;i<buffer.length;) {
    const code=buffer.charCodeAt(i);
    if(code===27) {
      const command=buffer[i+1];
      if(command==='!') mode=buffer.charCodeAt(i+2);
      i+=command==='@'?2:3;continue;
    }
    if(code===29) {i+=4;continue;}
    if(code===10) {expect(dots).toBeLessThanOrEqual(576);dots=0;i+=1;continue;}
    dots+=(mode&1)?9:12;i+=1;
  }
  expect(dots).toBeLessThanOrEqual(576);
}


beforeEach(() => {
  mockDatabase = memoryRealm();Bluetooth.write.mockReset().mockResolvedValue(true);Bluetooth.isConnected.mockReset().mockResolvedValue(true);
  Object.assign(mockDatabase.objects('GeneralProfile')[0], {companyName: 'Fixture Office', CompanyNo: 'FIXTURE', GstRegNo: '',
    Address1: '', Address2: '', Address3: '', Telephone1: '', Telephone2: '', Telephone3: ''});
});

test('actual ESC/POS path writes saved AN components without recalculating tax on excess', async () => {
  const saved = saveAdviceReceipt(mockDatabase, {items: [adviceItem({noticeNo: 'AN1', noticeDate: '2026-10-17', city: 'BTU', carNo: 'Q123', baseAmount: '1', excessCharge: '2', taxRate: '6', taxAmount: '0.06'}, RULES, false)], overdue: false,
    userName: 'U1', amountReceived: '5', rules: RULES, now: new Date('2026-10-17T04:00:00Z')});
  await new PrintReceipt().print('an', saved.receiptNo);
  const buffer = Bluetooth.write.mock.calls[0][0];
  expect(buffer).not.toContain('ADVICE NOTICE PAYMENT');
  expect(buffer).toMatch(/AN1\s+3\.00/);expect(buffer).toMatch(/6% of Tax:\s+0\.06/);
  expect(buffer).toMatch(/Net Total:\s+3\.05/);
  expectWithinPrintHead(buffer);
});

test('daily closing prints a separate AN row and keeps acknowledged receipts in totals', () => {
  const saved = saveAdviceReceipt(mockDatabase, {items: [adviceItem({noticeNo: 'AN1', noticeDate: '2026-10-17', city: 'BTU', carNo: 'Q123', baseAmount: '1', excessCharge: '2', taxRate: '6', taxAmount: '0.06'}, RULES, false)], overdue: false,
    userName: 'U1', amountReceived: '5', rules: RULES, now: new Date('2026-10-17T04:00:00Z')});
  mockDatabase.objectForPrimaryKey('AdviceReceiptHeader', saved.receiptNo).status = 'posted';
  new PrintClosing().print('2026-10-17', 'U1');
  const buffer = Bluetooth.write.mock.calls[0][0];
  expect(buffer).not.toContain('AN Base');expect(buffer).not.toContain('AN Excess');expect(buffer).not.toContain('AN Overdue');
  expect(buffer).toMatch(/AN\s+3\.00\s+0\.06\s+-0\.01\s+3\.05/);
  expect(buffer).toMatch(/Total\s+3\.00\s+0\.06\s+-0\.01\s+3\.05/);
});

test('reprint and closing use immutable collected cash and rounding if a later calculation changes', async () => {
  const saved = saveAdviceReceipt(mockDatabase, {items: [adviceItem({noticeNo: 'ANORIGINAL', noticeDate: '2026-10-17', city: 'BTU', carNo: 'Q123', baseAmount: '1', excessCharge: '2', taxRate: '6', taxAmount: '0.06'}, RULES, false)], overdue: false,
    userName: 'U1', amountReceived: '5', rules: RULES, now: new Date('2026-10-17T04:00:00Z')});
  const receipt = mockDatabase.objectForPrimaryKey('AdviceReceiptHeader', saved.receiptNo);
  expect(receipt.totalAmount).toBe(3.05);expect(receipt.rounding).toBe(-0.01);
  const collection = require('../src/advice/collection');const original = collection.adviceTotals;
  const changed = jest.spyOn(collection, 'adviceTotals').mockImplementation(items => ({...original(items), rounding: 99, total: 99999}));
  await new PrintReceipt().print('an', saved.receiptNo);
  new PrintClosing().print('2026-10-17', 'U1');
  expect(changed).not.toHaveBeenCalled();
  expect(Bluetooth.write.mock.calls[0][0]).toMatch(/Net Total:\s+3\.05/);
  expect(Bluetooth.write.mock.calls[1][0]).toMatch(/Total\s+3\.00\s+0\.06\s+-0\.01\s+3\.05/);
  changed.mockRestore();
});

test('closing propagates printer rejection and discards a partial failed render before another copy', async () => {
  const saved=saveAdviceReceipt(mockDatabase,{items:[adviceItem({noticeNo:'ANRENDER',noticeDate:'2026-10-17',city:'BTU',carNo:'Q123',baseAmount:'1',excessCharge:'2',taxRate:'6',taxAmount:'0.06'},RULES,false)],overdue:false,userName:'FIXTURE',amountReceived:'',rules:RULES,now:new Date('2026-10-17T04:00:00Z')});
  const receipt=mockDatabase.objectForPrimaryKey('AdviceReceiptHeader',saved.receiptNo),printer=new PrintClosing(),cash=receipt.totalAmount;
  receipt.totalAmount=-1;
  expect(()=>printer.print('2026-10-17','FIXTURE')).toThrow();expect(Bluetooth.write).not.toHaveBeenCalled();
  receipt.totalAmount=cash;
  await printer.print('2026-10-17','FIXTURE');const recovered=Bluetooth.write.mock.calls[0][0];
  await new PrintClosing().print('2026-10-17','FIXTURE');expect(Bluetooth.write.mock.calls[1][0]).toBe(recovered);
  Bluetooth.write.mockRejectedValueOnce(new Error('Synthetic native failure'));
  await expect(printer.print('2026-10-17','FIXTURE')).rejects.toThrow('Synthetic native failure');
  expect(receipt.totalAmount).toBe(cash);
});

test.each([null, undefined, '', '   '])('shared receipt/reprint header omits absent Telephone2 (%s)', value => {
  Object.assign(mockDatabase.objects('GeneralProfile')[0], {Telephone1: ' 086-111111 ', Telephone2: value, Telephone3: '086-333333'});
  const printer = new PrintReceipt();printer.initPrinter();const buffer = printer.escpos.build();
  expect(buffer).toContain('086-111111 086-333333');
  expect(buffer).not.toContain('null');expect(buffer).not.toContain('undefined');
});

test('shared receipt/reprint header keeps all supplied telephone numbers and omits an entirely absent telephone line', () => {
  const profile = mockDatabase.objects('GeneralProfile')[0];
  Object.assign(profile, {Telephone1: '086-111111', Telephone2: ' 086-222222 ', Telephone3: '086-333333'});
  const printer = new PrintReceipt();printer.initPrinter();
  expect(printer.escpos.build()).toContain('086-111111 086-222222 086-333333');
  Object.assign(profile, {Telephone1: null, Telephone2: undefined, Telephone3: ''});
  printer.initPrinter();const buffer=printer.escpos.build();
  expect(buffer).not.toContain('null');expect(buffer).not.toContain('undefined');
});

test.each(['coupon','op','oc','pa','mbill'])('legacy %s receipt/reprint keeps its header telephone omission and readable totals', async type => {
  const db=mockDatabase;const date=new Date('2026-10-17T04:00:00Z');
  Object.assign(db.objects('GeneralProfile')[0],{Telephone1:'086-111111',Telephone2:null,Telephone3:'086-333333',Tax:6});
  db.tables.CouponReceiptHeader=[{receiptNo:'CP-QA-1',receiptDate:date,userName:'FIXTURE',items:[{startingCouponNo:'QA001',endingCouponNo:'QA010',couponType:'20',amount:1,taxAmount:0.06}]}];
  db.tables.OpReceiptHeader=[{receiptNo:'OP-QA-1',receiptDate:date,userName:'FIXTURE',city:'Bintulu',items:[{opNo:'QA1',amount:1,taxAmount:0.06}]}];
  db.tables.PaReceiptHeader=[{receiptNo:'PA-QA-1',receiptDate:date,userName:'FIXTURE',city:'Bintulu',carNo:'TESTCAR',reminderNo:'',items:[{paNo:'QA1',offence:'QA ONLY',amount:1,opAmount:0,taxAmount:0.06,disAmount:0,disPercent:0}]}];
  db.tables.MBillReceiptHeader=[{receiptNo:'MB-QA-1',receiptDate:date,userName:'FIXTURE',items:[{mBillNo:'QA1',city:'Bintulu',amount:1}]}];
  const no={coupon:'CP-QA-1',op:'OP-QA-1',oc:'PA-QA-1',pa:'PA-QA-1',mbill:'MB-QA-1'}[type];
  await new PrintReceipt().print(type,no);
  const buffer=Bluetooth.write.mock.calls[0][0];
  expect(buffer).toContain('086-111111 086-333333');expect(buffer).not.toContain('null');
  expect(buffer).toContain('Net Total');expect(buffer).toContain('-'.repeat(48));
  expect(buffer).toContain('17/10/2026 12:00');
  expectWithinPrintHead(buffer);
});

test('disconnected native bridge cannot claim an AN print succeeded or alter the saved receipt', async () => {
  const saved=saveAdviceReceipt(mockDatabase,{items:[adviceItem({noticeNo:'ANOFFLINE',noticeDate:'2026-10-17',city:'Bintulu',carNo:'TESTCAR',baseAmount:'1',excessCharge:'0',taxRate:'0',taxAmount:'0'},RULES,false)],overdue:false,userName:'FIXTURE',amountReceived:'1',rules:RULES,now:new Date('2026-10-17T04:00:00Z')});
  const receipt=mockDatabase.objectForPrimaryKey('AdviceReceiptHeader',saved.receiptNo);const before=receipt.postingPayload;
  Bluetooth.isConnected.mockResolvedValue(false);
  await expect(new PrintReceipt().print('an',saved.receiptNo)).rejects.toThrow('Printer is not connected');
  expect(Bluetooth.write).not.toHaveBeenCalled();expect(receipt.status).toBe('pending');expect(receipt.postingPayload).toBe(before);
  Bluetooth.isConnected.mockResolvedValue(true);
  await new PrintReceipt().print('an',saved.receiptNo);
  expect(Bluetooth.write).toHaveBeenCalledTimes(1);expect(receipt.postingPayload).toBe(before);
});

test('AN printing propagates a native write-error event even when the legacy bridge resolves true', async () => {
  const emitter=require('react-native').DeviceEventEmitter;
  Bluetooth.write.mockImplementation(async()=>{emitter.emit('error',{message:'QA native write failed'});return true;});
  await expect(new PrintReceipt().writeAdvice('QA ONLY')).rejects.toThrow('QA native write failed');
});

test.each([false,true])('AN uses OPN invoice/table/footer layout, stored rates and optional tender (overdue %s)', async overdue => {
  const rules={...RULES,calendarDays:14,collectionPolicyVersion:2,feeBasis:'receipt',baseAmount:0.8,excessCharges:1,taxPercent:6,overdueFee:20};
  const item=adviceItem({noticeNo:'ANLAYOUT1',noticeDate:overdue?'2026-10-01':'2026-10-17',city:'Bintulu',carNo:'TESTCAR'},rules,overdue);
  const saved=saveAdviceReceipt(mockDatabase,{items:[item],overdue,userName:'FIXTURE',amountReceived:'',rules,now:new Date('2026-10-17T04:00:00Z')});
  const receipt=mockDatabase.objectForPrimaryKey('AdviceReceiptHeader',saved.receiptNo), original=receipt.postingPayload;
  Object.assign(mockDatabase.objects('GeneralProfile')[0],{Tax:99,Telephone1:'086-111111',Telephone2:null,Telephone3:'086-333333'});
  await new PrintReceipt().print('an',saved.receiptNo);
  const buffer=Bluetooth.write.mock.calls[0][0];
  let previous=-1;
  ['Tax Invoice No','Tax Invoice Date','Pondok ID:','Warden ID:','City:','Vehicle Reg. No:','AN No.','Price(RM)','ANLAYOUT1','Total:','Tax:','Sub Total:','Rounding:','Net Total:','Thank You!'].forEach(label=>{
    const index=buffer.indexOf(label,previous+1);expect(index).toBeGreaterThan(previous);previous=index;
  });
  expect(buffer).toContain('17/10/2026 12:00');expect(buffer).toMatch(overdue ? /ANLAYOUT1\s+20\.00\s+1\.80/ : /ANLAYOUT1\s+1\.80/);expect(buffer).toMatch(/6% of Tax:\s+0\.05/);
  expect(buffer).not.toContain('Overdue fee:');
  if(overdue)expect(buffer).toContain('Compound (RM)');
  expect(buffer).toMatch(overdue?/Net Total:\s+21\.85/:/Net Total:\s+1\.85/);
  expect(buffer).not.toContain('Received:');expect(buffer).not.toContain('Change:');
  expect(buffer).toContain('086-111111 086-333333');expect(buffer).not.toContain('null');expect(buffer).not.toContain('undefined');
  expectWithinPrintHead(buffer);expect(receipt.postingPayload).toBe(original);
  expect(receipt.amountReceived).toBeNull();
});

test('entered tender remains stored but tender and change are omitted from AN reprint', async () => {
  const item=adviceItem({noticeNo:'ANTENDER1',noticeDate:'2026-10-17',city:'BTU',carNo:'Q123',baseAmount:'1',excessCharge:'2',taxRate:'6',taxAmount:'0.06'},RULES,false);
  const saved=saveAdviceReceipt(mockDatabase,{items:[item],overdue:false,userName:'FIXTURE',amountReceived:'5',rules:RULES,now:new Date('2026-10-17T04:00:00Z')});
  await new PrintReceipt().print('an',saved.receiptNo);
  const buffer=Bluetooth.write.mock.calls[0][0];expect(buffer).not.toContain('Received:');expect(buffer).not.toContain('Change:');expect(mockDatabase.objectForPrimaryKey('AdviceReceiptHeader',saved.receiptNo).amountReceived).toBe(5);
});
