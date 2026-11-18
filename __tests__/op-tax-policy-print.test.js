import {memoryRealm} from '../test-support/memoryRealm';
import {legacyOpReceiptPayload} from '../src/payments/legacyPosting';
let mockDatabase;
jest.mock('../src/realm',()=>({objects:name=>mockDatabase.objects(name),objectForPrimaryKey:(...a)=>mockDatabase.objectForPrimaryKey(...a)}));
jest.mock('react-native-bluetooth-serial',()=>({write:jest.fn(()=>Promise.resolve(true)),isConnected:jest.fn(()=>Promise.resolve(true))}));
const PrintReceipt=require('../src/printReceipt').default,Bluetooth=require('react-native-bluetooth-serial');
beforeEach(()=>{mockDatabase=memoryRealm();Object.assign(mockDatabase.tables.GeneralProfile[0],{Tax:99,companyName:'QA ONLY',CompanyNo:'FIXTURE',GstRegNo:'',Address1:'',Address2:'',Address3:'',Telephone1:'',Telephone2:null,Telephone3:''});Bluetooth.write.mockClear();});
function receipt(version,count=13){return {receiptNo:'OP-P1-41',taxPolicyVersion:version,userName:'FIXTURE',pondokId:'P1',city:'Bintulu',receiptDate:new Date('2026-10-19T04:00:00Z'),reminderNo:null,items:Array.from({length:count},(_,i)=>({opNo:'OPNEW'+i,opDate:new Date('2026-10-19T04:00:00Z'),amount:0.8,taxAmount:0.05,tax:6}))};}
test('new OP marker prints stored pernotice tax/price and cash instead of changed current profile tax',async()=>{
 const row=receipt(3);mockDatabase.tables.OpReceiptHeader=[row];const before=JSON.stringify(row);await new PrintReceipt().print('op',row.receiptNo);const text=Bluetooth.write.mock.calls[0][0];
 expect(text).toMatch(/OPNEW0\s+0\.85/);expect(text).toMatch(/6% of Tax:\s+0\.65/);expect(text).toMatch(/Sub Total:\s+11\.05/);expect(text).toMatch(/Net Total:\s+11\.05/);expect(text).not.toContain('99% of Tax');expect(JSON.stringify(row)).toBe(before);
});
test('historical unmarked OP print path is unchanged by the new marker',async()=>{
 const row=receipt(null,1);mockDatabase.tables.OpReceiptHeader=[row];await new PrintReceipt().print('op',row.receiptNo);const text=Bluetooth.write.mock.calls[0][0];expect(text).toMatch(/OPNEW0\s+0\.80/);expect(text).toContain('99% of Tax:');expect(row.taxPolicyVersion).toBeNull();
});
test('legacy transport omits local marker without changing stored identity/date/tax/base fields',()=>{
 const row=receipt(3),before=JSON.stringify(row),wire=legacyOpReceiptPayload(row);expect(wire).not.toHaveProperty('taxPolicyVersion');const expected={...row};delete expected.taxPolicyVersion;expect(JSON.parse(JSON.stringify(wire))).toEqual(JSON.parse(JSON.stringify(expected)));expect(JSON.stringify(row)).toBe(before);
});
test.each([1,3,13,100])('new OP %i-line cash print uses integer cents without negative zero rounding',async count=>{
 const row=receipt(3,count);mockDatabase.tables.OpReceiptHeader=[row];await new PrintReceipt().print('op',row.receiptNo);const output=Bluetooth.write.mock.calls[0][0];expect(output).not.toContain('-0.00');expect(output).toMatch(new RegExp('Net Total:\\s+'+(count*85/100).toFixed(2).replace('.','\\.')));
});
