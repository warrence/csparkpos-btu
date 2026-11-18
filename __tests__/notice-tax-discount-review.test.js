import {noticeTaxCents} from '../src/payments/noticeTax';
import {memoryRealm} from '../test-support/memoryRealm';
import LoadOffence from '../src/components/load-data/LoadOffence';
import axios from 'axios';
import moment from 'moment';
let mockDatabase;
function mockObjects(name){const rows=mockDatabase.objects(name);rows.sorted=()=>rows;const filtered=rows.filtered.bind(rows);rows.filtered=(q,...args)=>name==='Offence'||name==='PaReceiptHeader'||name==='City'?rows:filtered(q,...args);return rows;}
jest.mock('../src/realm',()=>({objects:name=>mockObjects(name),create:(...a)=>mockDatabase.create(...a),write:fn=>mockDatabase.write(fn),delete:rows=>mockDatabase.delete(rows),objectForPrimaryKey:(...a)=>mockDatabase.objectForPrimaryKey(...a)}));
jest.mock('../src/global',()=>({SERVER_URL:'https://fixture.invalid'}));
jest.mock('axios',()=>({get:jest.fn()}));
jest.mock('../src/printReceipt',()=>jest.fn(()=>({print:jest.fn().mockResolvedValue(true)})));
jest.mock('bugsnag-react-native',()=>({Client:jest.fn(()=>({notify:jest.fn()}))}));
jest.mock('mobx-react',()=>({inject:()=>target=>target,observer:target=>target}));
const OPN=require('../src/components/payments/OpnPayment').default;
const Compound=require('../src/components/payments/CompoundPayment').default;
beforeEach(()=>{mockDatabase=memoryRealm();mockDatabase.tables.OpTable=[{amount:0.8}];jest.clearAllMocks();});
function opn(){const view=new OPN();view.props={authStore:{userName:'FIXTURE'},generalStore:{Tax:6}};view.setState=(update,callback)=>{Object.assign(view.state,update);if(callback)callback();};view.state.opDate=moment().format('YYYY-MM-DD');return view;}
test.each([1,3,13,100])('new OPN rounds tax per notice before summing %i items; configured .80/6%% yields .85 lines',count=>{
 const view=opn();for(let i=0;i<count;i++){view.state.opNo='OPFIX'+i;view.addItem();}
 expect(view.selectedNotices()).toHaveLength(count);expect(view.selectedNotices().every(row=>row.taxAmount===0.05&&Math.round((row.price+row.taxAmount)*100)===85)).toBe(true);expect(Number(view.state.total)).toBe(count*85/100);
});
test('configured nondefault rate/tax and overdue surcharge remain separate; no hardcoded amounts',()=>{
 mockDatabase.tables.OpTable=[{amount:0.83}];mockDatabase.tables.City[0].expiryPaRate=17.35;const view=opn();view.props.generalStore.Tax=7.5;
 view.onOpDateChange(moment().subtract(20,'days').format('YYYY-MM-DD'));view.state.carNo='TESTCAR';
 for(let i=0;i<3;i++){view.state.opNo='OPOTHER'+i;view.addItem();}
 expect(view.selectedNotices().map(row=>row.taxAmount)).toEqual([0.06,0.06,0.06]);expect(view.state.data.filter(row=>row.opNo==='Overdue Charges')).toHaveLength(1);
 expect(Number(view.state.total)).toBe(20); // 3*.89+17.35=20.02, basket cash rounding -.02
});
test.each([undefined,null,-1,101,'invalid'])('invalid tax %j has no fallback',value=>{expect(()=>noticeTaxCents(80,value)).toThrow();});
test('offence loader forwards exact case-sensitive Day_pay/Dis_percent and second tier into cached fields',async()=>{
 axios.get.mockResolvedValue({data:[{City:'BTU',aCode:'QAFIX',Descript:'Synthetic',Amount:10,Day_pay:14,Dis_percent:10,Day_pay2:7,Dis_percent2:20}]});
 expect(await LoadOffence()).toBe(true);expect(axios.get).toHaveBeenCalledWith('https://fixture.invalid/api/load-data/offence');expect(mockDatabase.objects('Offence')[0]).toMatchObject({dayPay:14,disPercent:10,dayPay2:7,disPercent2:20,workingDaysOnly:false});
});
test.each([[0,20],[6,20],[7,10],[8,10],[13,10],[14,0],[15,0]])('Compound automatically uses downloaded date tiers at age %i days: %i%%',async(age,percent)=>{
 axios.get.mockResolvedValue({data:[{City:'BTU',aCode:'QAFIX',Descript:'Synthetic',Amount:10,Day_pay:14,Dis_percent:10,Day_pay2:7,Dis_percent2:20}]});await LoadOffence();
 const view=new Compound();view.props={authStore:{userName:'FIXTURE'},generalStore:{Tax:6}};view.setState=update=>Object.assign(view.state,update);Object.assign(view.state,{city:'BTU',offence:'QAFIX',paAmount:10,paDate:moment().startOf('day').subtract(age,'days').toDate(),paNo:'PAFIX',carNo:'TESTCAR'});view.addItem();
 expect(view.state.data[0]).toMatchObject({disPercent:percent,disAmount:10*percent/100,taxAmount:0});expect(Number(view.state.total)).toBe(10-10*percent/100);
});
test.each([[75,6,5],[125,5,6],[80,6,5],[83,7.5,6],[100,0,0]])('base %i cents at %s%% has per-notice tax %i cents, including half-cent ties', (base,percent,expected)=>{expect(noticeTaxCents(base,percent)).toBe(expected);});

test.each([0,1,14,15])('Compound UI skips unused zero secondary tier at age%i without saving or printing',age=>{
 mockDatabase.tables.Offence=[{city:'BTU',code:'ARTICLE 3(5)',amount:20,dayPay:14,disPercent:50,dayPay2:0,disPercent2:0}];
 const view=new Compound(),before=JSON.stringify(mockDatabase.tables);view.props={authStore:{userName:'FIXTURE'},generalStore:{Tax:6}};view.setState=update=>Object.assign(view.state,update);Object.assign(view.state,{city:'BTU',offence:'ARTICLE 3(5)',paAmount:20,paDate:moment().subtract(age,'days').toDate(),paNo:'QADISC'+age,carNo:'TESTCAR'});view.addItem();
 expect(view.state.data).toHaveLength(1);expect(view.state.data[0].disPercent).toBe(age+1<=14?50:0);expect(view.state.data[0].disAmount).toBe(age+1<=14?10:0);expect(Number(view.state.total)).toBe(age+1<=14?10:20);expect(JSON.stringify(mockDatabase.tables)).toBe(before);expect(view.state.printReceipt.print).not.toHaveBeenCalled();
});
test('future Compound UI date keeps the basket unchanged',()=>{
 const toast=jest.spyOn(require('native-base').Toast,'show').mockImplementation(()=>{});
 mockDatabase.tables.Offence=[{city:'BTU',code:'QA',amount:20,dayPay:14,disPercent:50,dayPay2:0,disPercent2:0}];const view=new Compound();view.setState=update=>Object.assign(view.state,update);Object.assign(view.state,{city:'BTU',offence:'QA',paAmount:20,paDate:moment().add(1,'days').toDate(),paNo:'QAFUTURE',carNo:'TESTCAR'});view.addItem();expect(view.state.data).toHaveLength(0);expect(toast).toHaveBeenCalledWith(expect.objectContaining({text:'Compound date cannot be in the future.'}));toast.mockRestore();
});
