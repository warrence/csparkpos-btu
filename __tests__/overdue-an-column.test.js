// Load an existing historical synthetic receipt directly. Never collect/pay it.
import fixture from '../test-support/fixtures/advice-overdue-saved-schema25.json';
import {memoryRealm} from '../test-support/memoryRealm';
import {adviceReceiptLines,adviceClosing} from '../src/advice/receipt';
let mockDatabase;
jest.mock('../src/realm',()=>({objects:type=>mockDatabase.objects(type),objectForPrimaryKey:(...a)=>mockDatabase.objectForPrimaryKey(...a)}));
jest.mock('react-native-bluetooth-serial',()=>({write:jest.fn().mockResolvedValue(true),isConnected:jest.fn().mockResolvedValue(true)}));
jest.mock('axios',()=>({get:jest.fn(),post:jest.fn()}));
const PrintReceipt=require('../src/printReceipt').default;
const Advice=require('../src/components/payments/AdviceNoticePayment').AdviceNoticePayment;
const Bluetooth=require('react-native-bluetooth-serial');
function freeze(value){if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;}
let receipt;
beforeEach(()=>{
 mockDatabase=memoryRealm();Bluetooth.write.mockClear();
 receipt=freeze(JSON.parse(JSON.stringify(fixture),(key,value)=>['receiptDate','noticeDate'].includes(key)?new Date(value):value));
 mockDatabase.tables.AdviceReceiptHeader=[receipt];mockDatabase.tables.AdviceRules=[];
 Object.assign(mockDatabase.objects('GeneralProfile')[0],{companyName:'SYNTHETIC',CompanyNo:'FIXTURE',GstRegNo:'',Address1:'',Address2:'',Address3:'',Telephone1:'QA1',Telephone2:null,Telephone3:'QA3',Tax:99});
 mockDatabase.tables.PaReceiptHeader=[{receiptNo:'PA-OPNFIX-1',receiptDate:new Date(fixture.receiptDate),userName:'FIXTURE',city:'Bintulu',carNo:'TESTCAR',reminderNo:'',items:fixture.items.map(item=>({paNo:item.noticeNo,amount:item.overdueFee,opAmount:1.8,taxAmount:item.taxAmount}))}];
});
test('saved overdue AN prints exact OPN Compound(RM) column positions using original item allocations',async()=>{
 await new PrintReceipt().print('oc','PA-OPNFIX-1');const reference=Bluetooth.write.mock.calls[0][0].split('\n').find(line=>line.includes('Compound (RM)')).replace(/\x1b![\s\S]/g,'');
 const lines=adviceReceiptLines(receipt),header=lines.find(line=>line.includes('Compound (RM)'));
 expect(header.indexOf('Compound (RM)')).toBe(reference.indexOf('Compound (RM)'));
 expect(header.indexOf('Price(RM)')).toBe(reference.indexOf('Price(RM)'));expect(header.length).toBe(reference.length);
 const rows=lines.filter(line=>/^ANHIST/.test(line));expect(rows).toHaveLength(3);
 expect(rows.map(row=>row.slice(21,35).trim())).toEqual(['7.02','','7.02']);
 expect(rows.map(row=>row.slice(36).trim())).toEqual(['1.80','1.80','1.80']);
 expect(lines.every(line=>line.length<=48)).toBe(true);
});
test('historical tax/rounding/net and immutable metadata remain exact, without the removed summary',()=>{
 const before=JSON.stringify(receipt),closing=adviceClosing([receipt]),output=adviceReceiptLines(receipt).join('\n');
 expect(output).toMatch(/5% of Tax:\s+0\.12/);expect(output).toMatch(/Rounding:\s+-0\.02/);expect(output).toMatch(/Net Total:\s+19\.54/);
 expect(output).not.toContain('99%');expect(output).not.toContain('Overdue fee:');
 ['Coupon:','AN Date:','Base ','Excess ','Reminder No:','Received:','Change:'].forEach(label=>expect(output).not.toContain(label));
 expect(output.match(/7\.02/g)).toHaveLength(2); // Stored two legacy groups, no new20 allocation.
 expect(output.slice(output.indexOf('Rounding:'))).not.toContain('7.02');
 expect(JSON.stringify(receipt)).toBe(before);expect(adviceClosing([receipt])).toEqual(closing);
 expect(closing).toMatchObject({overdue:1404,tax:12,rounding:-2,total:1954});
});
test('original print path and actual AN reprint action render the same saved receipt with unchanged tear spacing',async()=>{
 const before=JSON.stringify(mockDatabase.tables);
 await new PrintReceipt().print('an',receipt.receiptNo);const first=Bluetooth.write.mock.calls[0][0];
 const screen=new Advice({database:mockDatabase,authStore:{userName:'FIXTURE'},printer:new PrintReceipt()});screen.setState=change=>Object.assign(screen.state,change);
 screen.state.lastReceiptNo=receipt.receiptNo;await screen.reprint();const reprint=Bluetooth.write.mock.calls[1][0];
 expect(reprint).toBe(first);expect(first).toContain('Compound (RM)');expect(first).not.toContain('Overdue fee:');
 expect(first.match(/\n*$/)[0]).toHaveLength(5);expect(first).toContain('Thank You!');
 expect(JSON.stringify(mockDatabase.tables)).toBe(before);expect(require('axios').post).not.toHaveBeenCalled();
});
test('current AN receipts retain their existing two-column minimal item layout',()=>{
 const current={...receipt,overdue:false,totalAmount:5.5,items:receipt.items.map(item=>({...item,overdueFee:0}))};
 const output=adviceReceiptLines(current).join('\n');expect(output).not.toContain('Compound (RM)');expect(output).not.toContain('Overdue fee:');
 expect(output).toMatch(/ANHIST01\s+1\.80/);expect(output).toMatch(/Net Total:\s+5\.50/);
});
test('overdue receipt with saved zero fees shows zero without inventing the currently configured charge',()=>{
 const zero={...receipt,totalAmount:5.5,items:receipt.items.map(item=>({...item,overdueFee:0}))};
 const rows=adviceReceiptLines(zero).filter(line=>/^ANHIST/.test(line));expect(rows.map(row=>row.slice(21,35).trim())).toEqual(['0.00','','']);
 expect(adviceReceiptLines(zero).join('\n')).toMatch(/Net Total:\s+5\.50/);
});

test('only later zero compound cells become blank; all notice prices and saved amounts stay visible',()=>{
 const before=JSON.stringify(receipt),rows=adviceReceiptLines(receipt).filter(line=>/^ANHIST/.test(line));
 expect(rows[0].slice(21,35).trim()).toBe('7.02');
 expect(rows[1].slice(21,35).trim()).toBe('');
 expect(rows[2].slice(21,35).trim()).toBe('7.02');
 expect(rows.map(row=>row.slice(36).trim())).toEqual(['1.80','1.80','1.80']);
 expect(JSON.stringify(receipt)).toBe(before);
});
