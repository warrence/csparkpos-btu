import {memoryRealm} from '../test-support/memoryRealm';
let mockDatabase;
jest.mock('../src/realm',()=>({objects:type=>mockDatabase.objects(type),objectForPrimaryKey:(type,id)=>mockDatabase.objectForPrimaryKey(type,id)}));
jest.mock('react-native-bluetooth-serial',()=>({write:jest.fn(()=>Promise.resolve(true)),isConnected:jest.fn(()=>Promise.resolve(true))}));
const PrintReceipt=require('../src/printReceipt').default;
const PrintClosing=require('../src/printClosing').default;
const Bluetooth=require('react-native-bluetooth-serial');
const date=new Date('2026-10-19T04:00:00Z');
beforeEach(()=>{
 mockDatabase=memoryRealm();Bluetooth.write.mockClear();
 Object.assign(mockDatabase.objects('GeneralProfile')[0],{companyName:'SYNTHETIC',CompanyNo:'FIXTURE',GstRegNo:'',Address1:'',Address2:'',Address3:'',Telephone1:'QA1',Telephone2:null,Telephone3:'QA3',Tax:6});
 mockDatabase.tables.OpReceiptHeader=[{receiptNo:'OP-P1-41',receiptDate:date,userName:'FIXTURE',pondokId:'P1',city:'Bintulu',items:[{opNo:'QA1',amount:1,taxAmount:0.06}]}];
 mockDatabase.tables.PaReceiptHeader=[{receiptNo:'PA-P1-71',receiptDate:date,userName:'FIXTURE',pondokId:'P1',city:'Bintulu',carNo:'TESTCAR',reminderNo:'',items:[{paNo:'QA1',offence:'SYNTHETIC',amount:10,opAmount:1,taxAmount:0.06,disAmount:0,disPercent:0}]}];
 mockDatabase.tables.AdviceReceiptHeader=[{receiptNo:'OP-P1-42',receiptDate:date,userName:'FIXTURE',pondokId:'P1',city:'Bintulu',carNo:'TESTCAR',overdue:false,amountReceived:null,totalAmount:1.85,rounding:0,postingPayload:'IMMUTABLE',items:[{noticeNo:'ANQA1',noticeDate:date,couponNo:'',baseAmount:0.8,excessCharge:1,taxRate:6,taxAmount:0.05,overdueFee:0}]}];
});

test.each([false,true])('daily closing adds exactly three footer LF bytes and omits AN breakdown (overdue %s)',overdue=>{
 mockDatabase.tables.CouponReceiptHeader=[];
 const receipt=mockDatabase.tables.AdviceReceiptHeader[0];
 if(overdue){receipt.overdue=true;receipt.items[0].overdueFee=20;receipt.totalAmount=21.85;}
 receipt.rounding=-0.02;receipt.totalAmount=Number((receipt.totalAmount-0.02).toFixed(2));
 ['OpReceiptHeader','PaReceiptHeader'].forEach(type=>{
  mockDatabase.tables[type][0].items.sum=function(field){return this.reduce((sum,item)=>sum+Number(item[field]||0),0);};
 });
 const before=JSON.stringify(mockDatabase.tables),old=new PrintClosing();
 const init=old.initPrinter.bind(old);
 // Reconstruct only the former two-LF footer; body and calculations are identical.
 old.initPrinter=()=>{init();const feed=old.escpos.printLineFeed;
  old.escpos.printLineFeed=function(n=1){return feed.call(this,n===5?2:n);};};
 old.print('2026-10-19','FIXTURE');const baseline=Bluetooth.write.mock.calls[0][0];
 new PrintClosing().print('2026-10-19','FIXTURE');const current=Bluetooth.write.mock.calls[1][0];
 expect(baseline.match(/\n*$/)[0]).toHaveLength(2);expect(current.match(/\n*$/)[0]).toHaveLength(5);
 expect(current).toBe(baseline+'\n\n\n');
 ['AN Base','AN Excess','AN Overdue'].forEach(label=>expect(current).not.toContain(label));
 expect(current).toMatch(overdue?/AN\s+21\.80\s+0\.05\s+-0\.02\s+21\.83/:/AN\s+1\.80\s+0\.05\s+-0\.02\s+1\.83/);
 expect(current).toMatch(overdue?/Total\s+33\.80\s+0\.17\s+-0\.04\s+33\.93/:/Total\s+13\.80\s+0\.17\s+-0\.04\s+13\.93/);
 new PrintClosing().print('2026-10-19','FIXTURE');expect(Bluetooth.write.mock.calls[2][0]).toBe(current);
 expect(JSON.stringify(mockDatabase.tables)).toBe(before);
});
test.each([['op','OP-P1-41'],['oc','PA-P1-71'],['pa','PA-P1-71'],['an','OP-P1-42']])('%s payment/reprint appends exactly two tear-off LF bytes with all existing content unchanged',async(kind,no)=>{
 const before=JSON.stringify(mockDatabase.tables),old=new PrintReceipt();
 // Compare the full real receipt path with its previous footer behavior.
 old.writePaymentReceipt=()=>old.writeAdvice(old.escpos.build());
 await old.print(kind,no);const baseline=Bluetooth.write.mock.calls[0][0];
 const printer=new PrintReceipt();await printer.print(kind,no);const current=Bluetooth.write.mock.calls[1][0];
 expect(baseline.match(/\n*$/)[0]).toHaveLength(3);expect(current.match(/\n*$/)[0]).toHaveLength(5);
 expect(current).toBe(baseline+'\n\n');expect(current).toContain('Net Total');
 expect(current).toContain('QA1 QA3');expect(current).not.toContain('null');
 await printer.print(kind,no);expect(Bluetooth.write.mock.calls[2][0]).toBe(current);
 expect(JSON.stringify(mockDatabase.tables)).toBe(before);
});

test.each(['pa','oc'])('%s new technical-key lines print exactly the legacy receipt before/after upload',async kind=>{
 const row=mockDatabase.tables.PaReceiptHeader[0];await new PrintReceipt().print(kind,row.receiptNo);const baseline=Bluetooth.write.mock.calls[0][0];row.lines=row.items.map((item,i)=>({...item,id:'TECH'+i,receiptNo:row.receiptNo,noticeKind:kind==='pa'?'compound':'op',city:row.city}));row.items=[];row.status='uploaded';await new PrintReceipt().print(kind,row.receiptNo);expect(Bluetooth.write.mock.calls[1][0]).toBe(baseline);
});
test('daily closing totals remain identical for legacy/new uploaded PA lines without double counting',()=>{
 ['OpReceiptHeader','PaReceiptHeader'].forEach(type=>{mockDatabase.tables[type][0].items.sum=function(field){return this.reduce((sum,item)=>sum+Number(item[field]||0),0);};});new PrintClosing().print('2026-10-19','FIXTURE');const baseline=Bluetooth.write.mock.calls[0][0];const row=mockDatabase.tables.PaReceiptHeader[0];row.lines=row.items.map(item=>({...item,id:'TECH'}));row.items=[];row.status='uploaded';new PrintClosing().print('2026-10-19','FIXTURE');expect(Bluetooth.write.mock.calls[1][0]).toBe(baseline);
});
test.each(['pa','oc'])('%s real print path rejects disconnected printer without modifying saved receipt',async kind=>{
 Bluetooth.isConnected.mockResolvedValueOnce(false);const before=JSON.stringify(mockDatabase.tables);await expect(new PrintReceipt().print(kind,'PA-P1-71')).rejects.toThrow('Printer is not connected');expect(Bluetooth.write).not.toHaveBeenCalled();expect(JSON.stringify(mockDatabase.tables)).toBe(before);
});
