import {Alert} from 'react-native';
import moment from 'moment';
import {memoryRealm,RULES} from '../test-support/memoryRealm';
import {paymentTender} from '../src/payments/tender';
let mockDatabase,mockPrint;
const mockObjects=type=>{
 const rows=mockDatabase.objects(type),filter=rows.filtered.bind(rows);
 rows.sorted=(key,reverse)=>Array.from(rows).sort((a,b)=>(a[key]>b[key]?1:a[key]<b[key]?-1:0)*(reverse?-1:1));
 rows.filtered=(query,...args)=>query.includes('paType')?rows:filter(query,...args);return rows;
};
jest.mock('../src/realm',()=>({objects:(...args)=>mockObjects(...args),write:cb=>mockDatabase.write(cb),objectForPrimaryKey:(...args)=>mockDatabase.objectForPrimaryKey(...args),create:(type,row)=>mockDatabase.create(type,type.endsWith('ReceiptHeader')&&!row.items?{...row,items:[]}:row)}));
jest.mock('../src/printReceipt',()=>jest.fn(()=>({print:(...args)=>mockPrint(...args)})));
jest.mock('axios',()=>({get:jest.fn(),post:jest.fn()}));
const Compound=require('../src/components/payments/CompoundPayment').default.wrappedComponent;
const OPN=require('../src/components/payments/OpnPayment').default.wrappedComponent;
const Advice=require('../src/components/payments/AdviceNoticePayment').AdviceNoticePayment;
const rules={...RULES,collectionPolicyVersion:3,feeBasis:'receipt',baseAmount:0.8,excessCharges:1,taxPercent:6};
function setup(kind,received){
 mockDatabase=memoryRealm();mockDatabase.tables.Offence=[{city:'BTU',code:'QA',dayPay:0,disPercent:0,dayPay2:0,disPercent2:0}];mockDatabase.tables.OpTable=[{amount:1.75}];['OpReceiptHeader','PaReceiptHeader','AdviceReceiptHeader','AdviceReceiptItem'].forEach(type=>mockDatabase.objects(type));mockPrint=jest.fn().mockResolvedValue(true);
 mockDatabase.tables.AdviceRules[0].json=JSON.stringify({protocolVersion:1,configured:true,rules});
 let screen,total=kind==='oc'?21.85:1.85;
 if(kind==='an'){
  screen=new Advice({database:mockDatabase,authStore:{userName:'FIXTURE'},printer:{print:(...a)=>mockPrint(...a)}});
 }else{screen=new(kind==='pa'?Compound:OPN)();screen.props={authStore:{userName:'FIXTURE'},generalStore:{Tax:6}};}
 screen.setState=change=>Object.assign(screen.state,change);
 if(kind==='an'){
  screen.setState({noticeNo:'ANTENDER1',carNo:'TESTCAR',noticeDate:moment().format('YYYY-MM-DD')});screen.addNotice();
 }else{
  const item=kind==='pa'?{paNo:'PAFIX1',paDate:new Date(),offence:'QA',price:1.85,taxAmount:0,carNo:'TESTCAR',disAmount:0,disPercent:0}
   :{opNo:'OPFIX1',opDate:kind==='oc'?moment().subtract(20,'days').format('YYYY-MM-DD'):moment().format('YYYY-MM-DD'),price:1.75,taxAmount:0.1,carNo:'TESTCAR'};
  screen.setState({data:kind==='oc'?[{opNo:'Overdue Charges',price:20},item]:[item],total:total.toFixed(2),city:'BTU',carNo:'TESTCAR',opDate:item.opDate,overdue:kind==='oc'});
 }
 screen.setState({amountReceived:received});
 return {screen,total,run:()=>kind==='an'?screen.pay():screen.processPayment(),headers:()=>mockDatabase.objects(kind==='pa'||kind==='oc'?'PaReceiptHeader':kind==='op'?'OpReceiptHeader':'AdviceReceiptHeader')};
}
beforeEach(()=>jest.spyOn(Alert,'alert').mockImplementation(()=>{}));
afterEach(()=>jest.restoreAllMocks());
test('change works in cents for fractional totals without a negative zero popup',()=>{
 expect(paymentTender('0.30',0.1+0.2)).toEqual({received:0.3,change:0});
 expect(paymentTender(' 5.00 ',1.85)).toEqual({received:5,change:3.15});
});
test.each([NaN,Infinity,0,-1])('invalid basket total %s cannot be bypassed with blank tender',total=>{
 expect(()=>paymentTender('',total)).toThrow('valid payment total');
});
for(const kind of ['pa','op','oc','an']){
 test.each(['','   ',null])(`${kind}: blank Received saves calculated basket once, no invented zero tender or negative change popup (%j)`,async received=>{
  const fixture=setup(kind,received);await fixture.run();
  expect(fixture.headers()).toHaveLength(1);expect(mockPrint).toHaveBeenCalledTimes(1);
  const popup=Alert.alert.mock.calls[0][0];expect(popup).toContain('Saved');expect(popup).not.toContain('Change:');
  if(kind==='an'){expect(fixture.headers()[0].amountReceived).toBeNull();expect(fixture.headers()[0].totalAmount).toBe(fixture.total);}
 });
 test.each(['exact','extra'])(`${kind}: entered %s cash shows a cents-accurate change popup`,async mode=>{
  const fixture=setup(kind,'');fixture.screen.state.amountReceived=(fixture.total+(mode==='extra'?3.15:0)).toFixed(2);await fixture.run();
  expect(fixture.headers()).toHaveLength(1);expect(Alert.alert).toHaveBeenCalledWith(expect.stringContaining(mode==='extra'?'Change: RM 3.15':'Change: RM 0.00'));
 });
 test.each(['0','1.84','-1','NaN','Infinity','1e2','2.001'])(`${kind}: nonblank insufficient/invalid tender %s never saves or prints`,async value=>{
  const fixture=setup(kind,value),before=JSON.stringify(mockDatabase.tables);await fixture.run();
  expect(fixture.headers()).toHaveLength(0);expect(mockPrint).not.toHaveBeenCalled();
  expect(JSON.stringify(mockDatabase.tables)).toBe(before);
  expect(Alert.alert).toHaveBeenCalledWith(expect.stringContaining('Payment was not saved:'));
  expect(kind==='an'?fixture.screen.state.items.length:fixture.screen.state.data.length).toBeGreaterThan(0);
 });
 test(`${kind}: printer failure retains committed receipt and still reports entered change`,async()=>{
  const fixture=setup(kind,'');fixture.screen.state.amountReceived=(fixture.total+3.15).toFixed(2);mockPrint.mockRejectedValue(new Error('synthetic printer offline'));
  await fixture.run();expect(fixture.headers()).toHaveLength(1);
  expect(Alert.alert.mock.calls[0][0]).toContain('Change: RM 3.15');
  expect(Alert.alert.mock.calls[0][0]).toContain('Printing failed');
  if(kind!=='an')expect(Alert.alert.mock.calls[0][2].map(button=>button.text)).toEqual(['Cancel','Reprint']);
 });
}
