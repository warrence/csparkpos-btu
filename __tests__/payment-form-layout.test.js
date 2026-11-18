// Real React form components, synthetic storage/settings and no hardware/network.
import React from 'react';
import renderer from 'react-test-renderer';
import moment from 'moment';
import {memoryRealm} from '../test-support/memoryRealm';
import {PaymentFormLayout,PaymentDateField,paymentFormStyles} from '../src/components/payments/shared/PaymentForm';
let mockDatabase;
const mockObjects=name=>{
 const rows=mockDatabase.objects(name),filter=rows.filtered.bind(rows);rows.sorted=()=>rows;
 rows.filtered=(query,...args)=>name==='City'||name==='Offence'||name==='PaReceiptHeader'?rows:filter(query,...args);return rows;
};
jest.mock('../src/realm',()=>({objects:(...a)=>mockObjects(...a),write:cb=>mockDatabase.write(cb),create:(...a)=>mockDatabase.create(...a),objectForPrimaryKey:(...a)=>mockDatabase.objectForPrimaryKey(...a),addListener:jest.fn(),removeListener:jest.fn()}));
jest.mock('react-native/Libraries/Components/DatePicker/DatePickerIOS.ios',()=> 'DatePickerIOS');
jest.mock('../src/printReceipt',()=>jest.fn(()=>({print:jest.fn().mockResolvedValue(true)})));
jest.mock('axios',()=>({get:jest.fn(),post:jest.fn()}));
const OPN=require('../src/components/payments/OpnPayment').default.wrappedComponent;
const Compound=require('../src/components/payments/CompoundPayment').default.wrappedComponent;
const Advice=require('../src/components/payments/AdviceNoticePayment').AdviceNoticePayment;
const {Toast}=require('native-base');
const rules={calendarDays:14,overdueFee:20,taxEnabled:true,taxPercent:6,windowIncludesCollectionDate:true,
 rounding:'nearest_0.05_on_notice_net_and_tax',collectionPolicyVersion:3,feeBasis:'receipt',baseAmount:0.8,excessCharges:1,reminderNoSupported:true};
const find=(tree,id)=>tree.root.findAll(node=>node.props.testID===id)[0];
const props={authStore:{userName:'FIXTURE'},generalStore:{Tax:6}};
beforeEach(()=>{
 mockDatabase=memoryRealm();mockDatabase.tables.City[0].expiryPaRate=10;mockDatabase.tables.OpTable=[{amount:2.5}];
 mockDatabase.tables.Offence=[{city:'BTU',code:'QA',amount:100,description:'Synthetic offence',dayPay:14,dayPay2:7,disPercent:10,disPercent2:20}];
 mockDatabase.tables.AdviceRules[0].json=JSON.stringify({protocolVersion:1,configured:true,rules});
 jest.spyOn(Toast,'show').mockImplementation(()=>{});
});
afterEach(()=>jest.restoreAllMocks());
for(const [prefix,Screen] of [['compound',Compound],['opn',OPN],['advice',Advice]]){
 test(`${prefix} uses common layout, readable fields/date textbox and optional tender`,()=>{
  const tree=renderer.create(<Screen {...props} database={mockDatabase}/>),screen=tree.getInstance();
  expect(tree.root.findByType(PaymentFormLayout).props.prefix).toBe(prefix);
  expect(tree.root.findAll(node=>node.props.testID==='holiday-calendar-status')).toHaveLength(0);
  expect(JSON.stringify(tree.toJSON())).not.toContain('Last holiday download:');
  expect(JSON.stringify(tree.toJSON())).not.toContain('download time unknown');
  const date=find(tree,`${prefix}-date-field`);expect(date.props.style).toEqual(paymentFormStyles.dateField);expect(date.props.style.borderWidth).toBe(1);
  expect(find(tree,`${prefix}-amountReceived`).props.accessibilityLabel).toBe('Received amount (optional)');
  expect(find(tree,`${prefix}-reminderNo`).props.placeholder).toBe('Reminder No. (optional)');
  expect(find(tree,`${prefix}-clear`)).toBeDefined();expect(find(tree,`${prefix}-reprint`)).toBeDefined();
  const picker=tree.root.findAll(node=>node.props.androidMode==='default'&&node.instance&&typeof node.instance.showDatePicker==='function')[0];
  const open=jest.spyOn(picker.instance,'showDatePicker').mockImplementation(()=>{});
  renderer.act(()=>date.props.onPress());expect(open).toHaveBeenCalledTimes(1);
  const selected=prefix==='compound'?new Date(2001,0,1):moment().toDate();
  renderer.act(()=>picker.props.onDateChange(selected));
  expect(find(tree,`${prefix}-date-value`).props.children).toBe(moment(selected).format('DD/MM/YYYY'));
  expect(require('axios').post).not.toHaveBeenCalled();tree.unmount();
 });
}
test('one downloaded OPN base2.50 is retained while displayed amount includes configured tax',()=>{
 const tree=renderer.create(<OPN {...props}/>),screen=tree.getInstance();
 expect(find(tree,'opn-rate-picker')).toBeUndefined();expect(find(tree,'opn-configured-rate').props.children.join('')).toBe('Amount RM 2.65');
 expect(screen.state.opAmount).toBe(2.5);renderer.act(()=>{screen.onOpDateChange(moment().format('YYYY-MM-DD'));screen.onOpNoChange('OPFIX1');});renderer.act(()=>screen.addItem());
 expect(screen.selectedNotices()[0].price).toBe(2.5);tree.unmount();
});
test('multiple downloaded OPN rates retain safe selection; unknown values are rejected',()=>{
 mockDatabase.tables.OpTable=[{amount:0.8},{amount:1.2}];const tree=renderer.create(<OPN {...props}/>),screen=tree.getInstance();
 expect(find(tree,'opn-configured-rate')).toBeUndefined();const picker=find(tree,'opn-rate-picker');expect(picker).toBeDefined();
 expect(React.Children.toArray(picker.props.children).map(node=>node.props.label)).toEqual(expect.arrayContaining(['RM 0.85','RM 1.27']));
 renderer.act(()=>picker.props.onValueChange(1.2));expect(screen.state.opAmount).toBe(1.2);
 renderer.act(()=>screen.onOpAmountChange(9.99));expect(screen.state.opAmount).toBe(1.2);
 renderer.act(()=>screen.onOpDateChange(moment().format('YYYY-MM-DD')));renderer.act(()=>screen.onOpNoChange('OPFIX1'));renderer.act(()=>screen.addItem());expect(screen.selectedNotices()[0].price).toBe(1.2);tree.unmount();
});
test.each([[],[{amount:0}],[{amount:null}],[{amount:1.001}]].map(rows=>[rows]))('missing/invalid downloaded OPN rates block add/pay (%j)',rows=>{
 mockDatabase.tables.OpTable=rows;const tree=renderer.create(<OPN {...props}/>),screen=tree.getInstance();
 expect(find(tree,'opn-add').props.disabled).toBe(true);expect(find(tree,'opn-pay').props.disabled).toBe(true);
 renderer.act(()=>screen.onOpDateChange(moment().format('YYYY-MM-DD')));renderer.act(()=>screen.onOpNoChange('OPFIX1'));renderer.act(()=>screen.addItem());expect(screen.selectedNotices()).toHaveLength(0);tree.unmount();
});
test('rate refresh updates the open form and never reprices saved receipts',()=>{
 const saved={receiptNo:'OP-P1-4',postingPayload:'IMMUTABLE'};mockDatabase.tables.AdviceReceiptHeader=[saved];
 const tree=renderer.create(<OPN {...props}/>),screen=tree.getInstance();renderer.act(()=>screen.onOpDateChange(moment().format('YYYY-MM-DD')));renderer.act(()=>screen.onOpNoChange('OPFIX1'));renderer.act(()=>screen.addItem());
 mockDatabase.tables.OpTable=[{amount:3.4}];renderer.act(()=>screen.refreshCalendar());
 expect(screen.selectedNotices()).toHaveLength(0);expect(screen.state.opAmount).toBe(3.4);expect(mockDatabase.tables.AdviceReceiptHeader[0]).toBe(saved);
 expect(find(tree,'opn-configured-rate').props.children.join('')).toBe('Amount RM 3.60');tree.unmount();
});
test('AN reminder input is optional and stays disabled without explicit downloaded office support',()=>{
 const db=mockDatabase;db.tables.AdviceRules[0].json=JSON.stringify({protocolVersion:1,configured:true,rules:{...rules,reminderNoSupported:undefined}});
 const tree=renderer.create(<Advice {...props} database={db}/>);expect(find(tree,'advice-reminderNo').props.editable).toBe(false);
 db.tables.AdviceRules[0].json=JSON.stringify({protocolVersion:1,configured:true,rules});renderer.act(()=>tree.getInstance().refreshConfiguration());
 expect(find(tree,'advice-reminderNo').props.editable).toBe(true);tree.unmount();
});

const textContent=node=>typeof node==='string'||typeof node==='number'?String(node):!node?'':Array.isArray(node)?node.map(textContent).join(''):textContent(node.children);
test.each([[0.8,6,'0.85'],[0.83,7.5,'0.89'],[1.25,5,'1.31'],[1.25,0,'1.25']])('OP unit display uses configured base%s/tax%s while preserving the base selection', (base,tax,shown)=>{
 mockDatabase.tables.OpTable=[{amount:base}];const tree=renderer.create(<OPN {...props} generalStore={{Tax:tax}}/>);
 expect(find(tree,'opn-configured-rate').props.children.join('')).toBe('Amount RM '+shown);expect(tree.getInstance().state.opAmount).toBe(base);tree.unmount();
});
test.each([[0.8,1,6,true,'1.85'],[1.25,2.35,5,true,'3.66'],[1.25,2.35,0,false,'3.60']])('AN combined unit display uses configured base%s/excess%s/tax%s/enabled%s', (base,excess,tax,enabled,shown)=>{
 mockDatabase.tables.AdviceRules[0].json=JSON.stringify({protocolVersion:1,configured:true,rules:{...rules,baseAmount:base,excessCharges:excess,taxPercent:tax,taxEnabled:enabled}});
 const tree=renderer.create(<Advice {...props} database={mockDatabase}/>);expect(find(tree,'advice-configured-rate').props.children.join('')).toBe('Amount RM '+shown);
 const text=textContent(tree.toJSON());['Base RM','Excess RM','calendar days','once per receipt','% on base'].forEach(label=>expect(text).not.toContain(label));
 expect(tree.getInstance().state.rules.baseAmount).toBe(base);expect(tree.getInstance().state.rules.overdueFee).toBe(20);tree.unmount();
});
test('AN condensed display keeps policy errors and blocks new collection under stale policy',()=>{
 mockDatabase.tables.AdviceRules[0].json=JSON.stringify({protocolVersion:1,configured:true,rules:{...rules,collectionPolicyVersion:2}});
 const tree=renderer.create(<Advice {...props} database={mockDatabase}/>);expect(textContent(tree.toJSON())).toContain('Download the office per-notice tax policy before new Advice collection.');expect(find(tree,'advice-pay').props.disabled).toBe(true);expect(find(tree,'advice-configured-rate')).toBeUndefined();tree.unmount();
});

test.each([['compound',Compound],['opn',OPN],['advice',Advice]])('%s basket remove uses matching MaterialIcons glyph and accessible44px target without changing semantics',(prefix,Screen)=>{
 const tree=renderer.create(<Screen {...props} database={mockDatabase}/>),screen=tree.getInstance();
 const row={paNo:'QAREMOVE',opNo:'QAREMOVE',noticeNo:'QAREMOVE',paDate:new Date(),opDate:moment().format('YYYY-MM-DD'),noticeDate:new Date(),city:'BTU',carNo:'TESTCAR',price:.8,taxAmount:.05,disAmount:0,baseAmount:.8,excessCharge:1,taxRate:6,overdueFee:0};
 renderer.act(()=>screen.setState(prefix==='advice'?{items:[row]}:{data:[row],total:.85}));
 const target=find(tree,prefix+'-remove-QAREMOVE');expect(target).toBeDefined();const touch=target.findAll(node=>node.props.accessibilityRole==='button'&&node.props.accessibilityLabel==='Remove notice QAREMOVE')[0];expect(touch.props.style.width).toBeGreaterThanOrEqual(44);expect(touch.props.style.minHeight).toBeGreaterThanOrEqual(44);expect(target.findAll(node=>node.props.type==='MaterialIcons'&&node.props.name==='delete').length).toBeGreaterThan(0);
 const before=JSON.stringify(mockDatabase.tables);renderer.act(()=>target.props.onPress());expect(prefix==='advice'?screen.state.items:screen.state.data).toHaveLength(0);expect(JSON.stringify(mockDatabase.tables)).toBe(before);
 renderer.act(()=>screen.setState(prefix==='advice'?{items:[row],saving:true}:{data:[row],saving:true}));expect(find(tree,prefix+'-remove-QAREMOVE').props.disabled).toBe(true);tree.unmount();
});
test('OP overdue charge remove remains disabled',()=>{const tree=renderer.create(<OPN {...props}/>);renderer.act(()=>tree.getInstance().onOpDateChange(moment().subtract(20,'days').format('YYYY-MM-DD')));expect(find(tree,'opn-remove-Overdue Charges').props.disabled).toBe(true);tree.unmount();});

test('normal OPN vehicle input stays editable with notices and blank plates remain optional',()=>{
 const tree=renderer.create(<OPN {...props}/>),screen=tree.getInstance();
 expect(find(tree,'opn-carNo').props.editable).toBe(true);
 renderer.act(()=>{screen.onCarNoChange('TESTCAR');screen.onOpDateChange(moment().format('YYYY-MM-DD'));screen.onOpNoChange('OPVEHICLE');});
 renderer.act(()=>screen.addItem());
 expect(find(tree,'opn-carNo').props.editable).toBe(true);
 renderer.act(()=>screen.onCarNoChange('OTHER'));expect(screen.state.carNo).toBe('OTHER');
 expect(find(tree,'opn-date-field').props.disabled).toBe(false);
 renderer.act(()=>screen.deleteItem(screen.selectedNotices()[0]));
 expect(find(tree,'opn-carNo').props.editable).toBe(true);tree.unmount();
});
