import fs from 'fs';
import path from 'path';
import {memoryRealm} from '../test-support/memoryRealm';
import {RECEIPT_80MM, receiptSprintf, textWidth} from '../src/printing/layout';
import EscposBuilder from '../src/EscposBuilder';
let mockDatabase;
jest.mock('../src/realm',()=>({objects:type=>mockDatabase.objects(type),objectForPrimaryKey:(...args)=>mockDatabase.objectForPrimaryKey(...args)}));
jest.mock('react-native-bluetooth-serial',()=>({write:jest.fn().mockResolvedValue(true),isConnected:jest.fn().mockResolvedValue(true)}));
const Receipt=require('../src/printReceipt').default;
const Closing=require('../src/printClosing').default;
const Bluetooth=require('react-native-bluetooth-serial');
const date=new Date('2026-10-21T04:00:00Z');

// Decode the actual renderer's ESC/POS stream, including font changes within
// a line. These are captured mock writes; never a physical print or collection.
function decode(buffer) {
  let mode=0,align=0,dots=0,text='',lines=[];
  const flush=()=>{lines.push({text,dots,align});dots=0;text='';};
  for(let i=0;i<buffer.length;) {
    const code=buffer.charCodeAt(i);
    if(code===27) {
      const command=buffer[i+1];
      if(command==='!')mode=buffer.charCodeAt(i+2);
      if(command==='a')align=buffer.charCodeAt(i+2);
      if(command==='@'){mode=0;align=0;}
      i+=command==='@'?2:3;continue;
    }
    if(code===29){
      if(buffer[i+1]==='W')expect(buffer.charCodeAt(i+2)+256*buffer.charCodeAt(i+3)).toBe(576);
      i+=4;continue;
    }
    if(code===10){flush();i++;continue;}
    const char=String.fromCodePoint(buffer.codePointAt(i));
    dots+=textWidth(char)===2?24:(mode&1?9:12);text+=char;i+=char.length;
  }
  if(text)flush();
  expect(lines.every(line=>line.dots<=576)).toBe(true);
  return lines;
}

beforeEach(()=>{
  mockDatabase=memoryRealm();Bluetooth.write.mockReset().mockResolvedValue(true);Bluetooth.isConnected.mockReset().mockResolvedValue(true);
  Object.assign(mockDatabase.objects('GeneralProfile')[0],{companyName:'SYNTHETIC LONG COMPANY NAME '+ 'BUSINESS '.repeat(9),CompanyNo:'FIXTURE',GstRegNo:'',Address1:'A VERY LONG ADDRESS '+ 'ROAD '.repeat(25),Address2:'',Address3:'',Telephone1:'FIXTURE',Telephone2:null,Telephone3:'',Tax:6});
  const header=receiptNo=>({receiptNo,receiptDate:date,userName:'FIXTURE',pondokId:'P1',city:'Bintulu',carNo:'TESTCAR',reminderNo:''});
  const notice='LONGNOTICEIDENTIFIER'.repeat(4);
  mockDatabase.tables.CouponReceiptHeader=[{...header('CP-FIXTURE-1'),items:[{startingCouponNo:'CP'+notice,endingCouponNo:'CP999',couponType:'20',amount:999999.99,taxAmount:0,tax:0}]}];
  mockDatabase.tables.OpReceiptHeader=[{...header('OP-FIXTURE-1'),taxPolicyVersion:3,items:[{opNo:notice,opDate:date,amount:.8,taxAmount:.05,tax:6}]}];
  mockDatabase.tables.PaReceiptHeader=[{...header('PA-FIXTURE-1'),paType:'O',items:[{paNo:notice,paDate:date,offence:'LONG OFFENCE DESCRIPTION '+ 'NOTICE '.repeat(8),amount:10,opAmount:.8,taxAmount:.05,disAmount:0,disPercent:0,tax:6}]}];
  mockDatabase.tables.MBillReceiptHeader=[{...header('MB-FIXTURE-1'),items:[{mBillNo:notice,city:'Bintulu',amount:999999.99}]}];
  mockDatabase.tables.AdviceReceiptHeader=[{...header('AN-FIXTURE-1'),overdue:true,rulesSnapshot:'{"collectionPolicyVersion":3}',totalAmount:21.85,rounding:0,postingPayload:'IMMUTABLE',items:[{noticeNo:notice,noticeDate:date,baseAmount:.8,excessCharge:1,taxAmount:.05,taxRate:6,overdueFee:20}]}];
  ['CouponReceiptHeader','OpReceiptHeader','PaReceiptHeader'].forEach(model=>mockDatabase.tables[model].forEach(row=>{row.items.sum=key=>row.items.reduce((sum,item)=>sum+Number(item[key]||0),0);}));
});

test.each(['coupon','op','oc','pa','mbill','an','closing','test'])('actual %s renderer fits 576 dots and preserves all saved state',async kind=>{
  const ids={coupon:'CP-FIXTURE-1',op:'OP-FIXTURE-1',oc:'PA-FIXTURE-1',pa:'PA-FIXTURE-1',mbill:'MB-FIXTURE-1',an:'AN-FIXTURE-1'};
  const before=JSON.stringify(mockDatabase.tables);
  if(kind==='closing')await new Closing().print('2026-10-21','FIXTURE');
  else await new Receipt().print(kind,ids[kind]);
  expect(Bluetooth.write).toHaveBeenCalledTimes(1);
  const buffer=Bluetooth.write.mock.calls[0][0],lines=decode(buffer);
  expect(buffer).toContain('\x1d\x57\x40\x02');
  expect(lines.map(l=>l.text).join('')).toContain('SYNTHETIC LONG COMPANY NAME');
  if(kind!=='test') {
    ['TEST ONLY - NOT A PAYMENT','80mm paper / 72mm printable',
      'Font A - both L/R','Font B - both L/R','WRAP TEST:',
      'L'+'-'.repeat(46)+'R','L'+'-'.repeat(62)+'R'].forEach(marker=>expect(buffer).not.toContain(marker));
  }
  if(['coupon','mbill'].includes(kind))expect(lines.some(l=>l.text.trim().endsWith('999999.99'))).toBe(true);
  expect(JSON.stringify(mockDatabase.tables)).toBe(before);
  if(process.env.CSPARKPOS_PRINT_PREVIEW_DIR){
    const dir=process.env.CSPARKPOS_PRINT_PREVIEW_DIR;fs.mkdirSync(dir,{recursive:true});
    fs.writeFileSync(path.join(dir,kind+'.escpos'),Buffer.from(buffer,'utf8'));
    fs.writeFileSync(path.join(dir,kind+'.txt'),lines.map(l=>l.text).join('\n'));
    fs.writeFileSync(path.join(dir,kind+'.json'),JSON.stringify(lines,null,2));
  }
});

test('closing retains five monetary columns in Font B including large signed rounding',()=>{
  const line=receiptSprintf('%-8s %-10.2f %-10.2f %-10.2f %-10.2f','Total',999999999.99,999999.99,-999999.99,999999999.99);
  expect(textWidth(line)).toBe(64);expect(line.trim().endsWith('999999999.99')).toBe(true);
  decode(new EscposBuilder(RECEIPT_80MM).init().text(line,'small').printLineFeed().build());
});

test('normal and small wide-character headers wrap without losing characters',()=>{
  for(const size of ['normal','small']){
    const text='Bintulu 中文 '+ '地址'.repeat(40);
    const lines=decode(new EscposBuilder(RECEIPT_80MM).init().text(text,size).printLineFeed().build());
    expect(lines.map(l=>l.text).join('').replace(/\s/g,'')).toBe(text.replace(/\s/g,''));
  }
});

test('Settings test is clearly nonfinancial, bounded and guarded against disconnection',async()=>{
  const before=JSON.stringify(mockDatabase.tables);
  await new Receipt().print('test');const buffer=Bluetooth.write.mock.calls[0][0];
  expect(buffer).toContain('TEST ONLY - NOT A PAYMENT');
  expect(buffer).toContain('L'+'-'.repeat(46)+'R');expect(buffer).toContain('L'+'-'.repeat(62)+'R');
  expect(JSON.stringify(mockDatabase.tables)).toBe(before);
  Bluetooth.isConnected.mockResolvedValueOnce(false);
  await expect(new Receipt().print('test')).rejects.toThrow('Printer is not connected.');
  expect(Bluetooth.write).toHaveBeenCalledTimes(1);
});


test.each(['shared','mixed'])('normal OPN %s saved vehicles fit 80mm and remain associated with their notices',async mode=>{
  const row=mockDatabase.tables.OpReceiptHeader[0];
  const vehicle='SYNTHETICVEHICLE'+'X'.repeat(70);
  row.items=[
    {opNo:'SYNTHETIC-ONE',opDate:date,amount:.8,taxAmount:.05,tax:6,carNo:vehicle},
    {opNo:'SYNTHETIC-TWO',opDate:date,amount:.8,taxAmount:.05,tax:6,carNo:mode==='shared'?vehicle:'OTHERPLATE'},
    ...(mode==='mixed'?[{opNo:'SYNTHETIC-UNKNOWN',opDate:date,amount:.8,taxAmount:.05,tax:6,carNo:null}]:[])
  ];
  row.carNo=mode==='shared'?vehicle:null;
  const before=JSON.stringify(row);
  await new Receipt().print('op',row.receiptNo);
  const buffer=Bluetooth.write.mock.calls[0][0],lines=decode(buffer),text=lines.map(line=>line.text).join('\n');
  expect(lines.map(line=>line.text).join('').replace(/\s/g,'')).toContain(vehicle);
  expect((text.match(/Vehicle Reg\. No:/g)||[]).length).toBe(mode==='shared'?1:2);
  if(mode==='shared')expect(text.indexOf('Vehicle Reg. No:')).toBeLessThan(text.indexOf('OPN No.'));
  else {
    expect(text.indexOf('SYNTHETIC-ONE')).toBeLessThan(text.indexOf('Vehicle Reg. No:'));
    expect(text.indexOf('SYNTHETIC-TWO')).toBeLessThan(text.indexOf('Vehicle Reg. No: OTHERPLATE'));
    expect(text.indexOf('Vehicle Reg. No: OTHERPLATE')).toBeLessThan(text.indexOf('SYNTHETIC-UNKNOWN'));
  }
  expect(JSON.stringify(row)).toBe(before);
  if(process.env.CSPARKPOS_PRINT_PREVIEW_DIR){
    const dir=process.env.CSPARKPOS_PRINT_PREVIEW_DIR;fs.mkdirSync(dir,{recursive:true});
    fs.writeFileSync(path.join(dir,'op-'+mode+'-vehicle.txt'),text);
    fs.writeFileSync(path.join(dir,'op-'+mode+'-vehicle.json'),JSON.stringify(lines,null,2));
  }
});
