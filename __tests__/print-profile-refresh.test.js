import {memoryRealm} from '../test-support/memoryRealm';
import {printProfileSnapshot} from '../src/printing/profile';
import {DeviceEventEmitter} from 'react-native';
let mockDatabase;
jest.mock('../src/realm',()=>({objects:type=>mockDatabase.objects(type),objectForPrimaryKey:(type,id)=>mockDatabase.objectForPrimaryKey(type,id)}));
jest.mock('react-native-bluetooth-serial',()=>({write:jest.fn(()=>Promise.resolve(true)),isConnected:jest.fn(()=>Promise.resolve(true))}));
const Receipt=require('../src/printReceipt').default,Closing=require('../src/printClosing').default,Bluetooth=require('react-native-bluetooth-serial');
const date=new Date('2026-10-19T04:00:00Z');
const profile=name=>({companyName:name,CompanyNo:'QA COMPANY',GstRegNo:'QA GST',Address1:'QA ADDRESS',Address2:'',Address3:'',Telephone1:'QA PHONE',Telephone2:null,Telephone3:'',PondokId:'P1',Tax:6});
const ids={test:null,coupon:'CP-QA-1',op:'OP-QA-1',oc:'PA-QA-1',pa:'PA-QA-1',an:'AN-QA-1',mbill:'MB-QA-1'};
const header=receiptNo=>({receiptNo,receiptDate:date,userName:'FIXTURE',pondokId:'P1',city:'Bintulu',carNo:'TESTCAR',reminderNo:''});
beforeEach(()=>{
 mockDatabase=memoryRealm();mockDatabase.tables.GeneralProfile=[profile('OLD HEADER')];Bluetooth.write.mockReset().mockResolvedValue(true);Bluetooth.isConnected.mockReset().mockResolvedValue(true);
 mockDatabase.tables.CouponReceiptHeader=[{...header(ids.coupon),items:[{startingCouponNo:'QA001',endingCouponNo:'QA010',couponType:'20',amount:1,taxAmount:.06}]}];
 mockDatabase.tables.OpReceiptHeader=[{...header(ids.op),taxPolicyVersion:3,items:[{opNo:'QO1',amount:.8,taxAmount:.05,tax:6}]}];
 mockDatabase.tables.PaReceiptHeader=[{...header(ids.pa),items:[{paNo:'QO2',offence:'QA ONLY',amount:10,opAmount:.8,taxAmount:.05,disAmount:0,disPercent:0}]}];
 mockDatabase.tables.MBillReceiptHeader=[{...header(ids.mbill),items:[{mBillNo:'QA MB',city:'Bintulu',amount:1}]}];
 mockDatabase.tables.AdviceReceiptHeader=[{...header(ids.an),overdue:true,totalAmount:21.85,rounding:0,postingPayload:'IMMUTABLE',rulesSnapshot:'{"collectionPolicyVersion":3}',items:[{id:'QA ITEM',noticeNo:'QA1',noticeDate:date,baseAmount:.8,excessCharge:1,taxAmount:.05,taxRate:6,overdueFee:20}]}];
 for(const model of ['OpReceiptHeader','PaReceiptHeader','CouponReceiptHeader'])mockDatabase.tables[model].forEach(row=>{row.items.sum=field=>row.items.reduce((sum,item)=>sum+Number(item[field]||0),0);});
});
const savedData=()=>JSON.stringify(Object.keys(mockDatabase.tables).filter(name=>name!=='GeneralProfile').map(name=>[name,mockDatabase.tables[name]]));
function replacementTrap(){let invalid=false;const old=new Proxy(profile('OLD HEADER'),{get:(target,key)=>{if(invalid)throw Error('Accessing object of type GeneralProfile which has been invalidated or deleted');return target[key];}});mockDatabase.tables.GeneralProfile=[old];return()=>{invalid=true;mockDatabase.tables.GeneralProfile=[profile('REFRESHED HEADER')];};}
test.each(Object.keys(ids))('%s cached printer uses fresh primitive header after profile delete/recreate',async kind=>{
 const replace=replacementTrap(),printer=new Receipt(),before=savedData();replace();await printer.print(kind,ids[kind]);
 expect(Bluetooth.write).toHaveBeenCalledTimes(1);const buffer=Bluetooth.write.mock.calls[0][0];expect(buffer).toContain('REFRESHED HEADER');expect(buffer).not.toContain('OLD HEADER');expect(savedData()).toBe(before);expect(Object.isFrozen(printer.generalProfile)).toBe(true);
});
test('closing created before Load Data uses current header and unchanged financial totals',async()=>{
 const replace=replacementTrap(),printer=new Closing(),before=savedData();replace();await expect(printer.print('2026-10-19','FIXTURE')).resolves.toBe(true);const buffer=Bluetooth.write.mock.calls[0][0];expect(buffer).toContain('REFRESHED HEADER');expect(buffer).not.toContain('OLD HEADER');expect(buffer).toMatch(/Total\s+34\.40\s+0\.21\s+-0\.01\s+34\.60/);expect(savedData()).toBe(before);
});
test.each(['receipt','closing'])('%s missing profile fails before write and same printer recovers after refresh',async kind=>{
 const printer=kind==='receipt'?new Receipt():new Closing(),print=()=>kind==='receipt'?printer.print('op',ids.op):printer.print('2026-10-19','FIXTURE');mockDatabase.tables.GeneralProfile=[];
 expect(print).toThrow('Load company and pondok settings before printing.');expect(Bluetooth.write).not.toHaveBeenCalled();mockDatabase.tables.GeneralProfile=[profile('NEW HEADER')];await print();expect(Bluetooth.write.mock.calls[0][0]).toContain('NEW HEADER');
});
test('snapshot remains plain and stable while replacement affects only next print',async()=>{
 const printer=new Receipt();await printer.print('op',ids.op);const snapshot=printer.generalProfile;mockDatabase.tables.GeneralProfile[0].companyName='LATER HEADER';expect(snapshot.companyName).toBe('OLD HEADER');await printer.print('op',ids.op);const buffer=Bluetooth.write.mock.calls[1][0];expect(buffer).toContain('LATER HEADER');expect(buffer).not.toContain('OLD HEADER');expect(buffer.match(/Net Total/g)).toHaveLength(1);
});
test('receipt native write error removes listener; fresh next print has one current header and no receipt mutation',async()=>{
 const printer=new Receipt(),before=savedData(),realAdd=DeviceEventEmitter.addListener.bind(DeviceEventEmitter),remove=jest.fn();const spy=jest.spyOn(DeviceEventEmitter,'addListener').mockImplementation((event,handler)=>{const subscription=realAdd(event,handler);return{remove:()=>{remove();subscription.remove();}};});
 Bluetooth.write.mockImplementationOnce(async()=>{DeviceEventEmitter.emit('error',{message:'SYNTHETIC WRITE FAILURE'});return true;});await expect(printer.print('op',ids.op)).rejects.toThrow('SYNTHETIC WRITE FAILURE');expect(remove).toHaveBeenCalledTimes(1);
 mockDatabase.tables.GeneralProfile=[profile('RECOVERED HEADER')];await printer.print('op',ids.op);expect(remove).toHaveBeenCalledTimes(2);expect(Bluetooth.write.mock.calls[1][0].match(/RECOVERED HEADER/g)).toHaveLength(1);expect(savedData()).toBe(before);spy.mockRestore();
});
test('closing rejected write does not mutate receipts and reusable printer discards old header',async()=>{
 const printer=new Closing(),before=savedData();Bluetooth.write.mockRejectedValueOnce(Error('SYNTHETIC DISCONNECTED'));await expect(printer.print('2026-10-19','FIXTURE')).rejects.toThrow('SYNTHETIC DISCONNECTED');mockDatabase.tables.GeneralProfile=[profile('AFTER FAILURE')];await printer.print('2026-10-19','FIXTURE');const buffer=Bluetooth.write.mock.calls[1][0];expect(buffer).toContain('AFTER FAILURE');expect(buffer).not.toContain('OLD HEADER');expect(buffer.match(/Closing Date/g)).toHaveLength(1);expect(savedData()).toBe(before);
});
test('snapshot helper does not synthesize missing settings',()=>{mockDatabase.tables.GeneralProfile=[];expect(()=>printProfileSnapshot(mockDatabase)).toThrow('Load company and pondok settings before printing.');});
