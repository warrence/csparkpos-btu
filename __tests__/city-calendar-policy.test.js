// Synthetic settings/notices only; production routes and native printer isolated.
import moment from 'moment';
import {Alert} from 'react-native';
import {memoryRealm} from '../test-support/memoryRealm';
import {calendarIsOverdue, calendarWindowDates, configuredCalendarDays} from '../src/payments/calendarWindow';
let mockDatabase;
const mockObjects = name => {
  const rows = mockDatabase.objects(name); rows.sorted = () => rows;
  rows.filtered = (query, ...args) => {
    if (name === 'City') return rows.filter(row => row.code === (args[0] || query.match(/"(.*)"/)[1]));
    if (name === 'Holiday') throw new Error('Calendar policy must not query holiday cache');
    return rows;
  };
  return rows;
};
jest.mock('../src/realm', () => ({objects: (...args) => mockObjects(...args),
  addListener: jest.fn(), removeListener: jest.fn(),
  write: cb => mockDatabase.write(() => { cb(); if(mockDatabase.failWrite) throw new Error('Synthetic rollback'); }),
  delete: rows => { for(const name of Object.keys(mockDatabase.tables)) if(rows.length && mockDatabase.tables[name][0]===rows[0]) mockDatabase.tables[name]=[]; },
  objectForPrimaryKey: (...a) => mockDatabase.objectForPrimaryKey(...a),
  create: (name, row) => mockDatabase.create(name,name==='City'?{...row,id:row.code}:name.endsWith('ReceiptHeader')&&!row.items?{...row,items:[]}:row)}));
jest.mock('../src/printReceipt', () => jest.fn(() => ({print: jest.fn().mockResolvedValue(true)})));
jest.mock('axios', () => ({get: jest.fn()}));
jest.mock('../src/global', () => ({SERVER_URL:'http://fixture.invalid'}));
jest.mock('bugsnag-react-native', () => ({Client: class {notify() {}}}));
const {getOpPayableDate} = require('../src/helpers');
const LoadCity = require('../src/components/load-data/LoadCity').default;
const OPN = require('../src/components/payments/OpnPayment').default.wrappedComponent;
const axios = require('axios');
const {Toast} = require('native-base');
const date = days => moment().subtract(days,'days').format('YYYY-MM-DD');
const cityPayload = (op=7,compound=30) => ({City:'BTU',CityName:'Synthetic',OpExpiryDay:op,CompoundExpiryDay:compound,
  AllowOverduePa:'N',ExpiryPARate:10,Add1:'',Add2:'',Add3:'',Tel:'',Gst_regno:''});
function screen() {
  const s=new OPN();s.props={generalStore:{Tax:6},authStore:{userName:'FIXTURE'}};
  s.setState=(value,done)=>{Object.assign(s.state,value);if(done)done();};s.componentDidMount();return s;
}
function add(s,no,days) {s.onOpNoChange(no);s.onOpDateChange(date(days));s.addItem();}
beforeEach(()=>{
  mockDatabase=memoryRealm();mockDatabase.tables.OpTable=[{amount:0.8}];
  mockDatabase.tables.City[0].expiryPaRate=10;
  jest.spyOn(Alert,'alert').mockImplementation(()=>{});jest.spyOn(Toast,'show').mockImplementation(()=>{});
});
afterEach(()=>jest.restoreAllMocks());

test.each([1,2,7,30,365])('city calendar window %s counts issue day1 and expires on N+1',days=>{
  const now=new Date('2026-10-17T04:00:00Z'),today=moment(now);
  mockDatabase.tables.City[0].opExpiryDay=days;
  const dates=getOpPayableDate('BTU',now);
  expect(dates).toHaveLength(days);expect(dates[days-1].format('YYYY-MM-DD')).toBe(today.clone().subtract(days-1,'days').format('YYYY-MM-DD'));
  expect(calendarIsOverdue(dates[days-1].format('YYYY-MM-DD'),days,now)).toBe(false);
  expect(calendarIsOverdue(today.clone().subtract(days,'days').format('YYYY-MM-DD'),days,now)).toBe(true);
});
test('compound field uses the same calendar classifier, independent of OPN value, without fees',()=>{
  const now=new Date('2026-10-17T04:00:00Z');mockDatabase.tables.City[0].compoundExpiryDay=30;
  const city=mockDatabase.tables.City[0];
  expect(calendarIsOverdue('2026-09-18',city.compoundExpiryDay,now)).toBe(false);
  expect(calendarIsOverdue('2026-09-17',city.compoundExpiryDay,now)).toBe(true);
  expect(calendarIsOverdue('2026-09-18',city.opExpiryDay,now)).toBe(true);
});
test('date-only boundaries follow device-local Asia/Kuching day across UTC midnight offset and leap year',()=>{
  expect(calendarIsOverdue('2026-10-04',14,new Date('2026-10-17T15:59:59Z'))).toBe(false);
  expect(calendarIsOverdue('2026-10-04',14,new Date('2026-10-17T16:00:00Z'))).toBe(true);
  expect(calendarIsOverdue('2024-02-29',2,new Date('2024-03-01T04:00:00Z'))).toBe(false);
  expect(calendarIsOverdue('2024-02-28',2,new Date('2024-03-01T04:00:00Z'))).toBe(true);
  expect(()=>calendarIsOverdue('2026-10-18',14,new Date('2026-10-17T04:00:00Z'))).toThrow('future');
});
test.each([undefined,null,'',0,-1,1.5,'14x',NaN,Infinity,10000])('missing/invalid expiry %s has no fallback window',value=>{
  expect(()=>configuredCalendarDays(value)).toThrow('Load valid');
  expect(()=>calendarWindowDates(value)).toThrow('Load valid');
});
test('LoadCity persists exact two expiry fields as integers and keeps the existing overdue flag mapping',async()=>{
  axios.get.mockResolvedValue({data:[cityPayload('7','30')]});expect(await LoadCity()).toBe(true);
  expect(mockDatabase.tables.City[0]).toMatchObject({opExpiryDay:7,compoundExpiryDay:30,allowOverduePa:false});
  expect(getOpPayableDate('BTU')).toHaveLength(7);
});
test('invalid downloaded windows are cached as unusable zero, never as an assumed14 or unlimited policy',async()=>{
  axios.get.mockResolvedValue({data:[cityPayload(null,'bad')]});expect(await LoadCity()).toBe(true);
  expect(mockDatabase.tables.City[0]).toMatchObject({opExpiryDay:0,compoundExpiryDay:0});
  expect(()=>getOpPayableDate('BTU')).toThrow('Load valid');
  expect(()=>calendarIsOverdue(date(1),mockDatabase.tables.City[0].compoundExpiryDay)).toThrow('Load valid');
});
test.each(['network','transaction'])('failed %s city refresh retains last successful offline settings',async failure=>{
  const previous=JSON.stringify(mockDatabase.tables);
  if(failure==='network')axios.get.mockRejectedValue(new Error('Synthetic offline'));
  else{axios.get.mockResolvedValue({data:[cityPayload(2,3)]});mockDatabase.failWrite=true;}
  expect(await LoadCity()).toBe(false);expect(JSON.stringify(mockDatabase.tables)).toBe(previous);
});
test.each([1,3,7])('OPN add checks current/overdue against downloaded %s-day window, never a fixed14',days=>{
  mockDatabase.tables.City[0].opExpiryDay=days;const s=screen();
  add(s,'OPDAYN',days-1);expect(s.selectedNotices()).toHaveLength(1);
  add(s,'OPDAYNEXT',days);expect(s.selectedNotices()).toHaveLength(1);
  s.clearForm();s.onCarNoChange('TESTCAR');add(s,'OPCURRENT',days-1);expect(s.state.overdue).toBe(false);s.clearForm();s.onCarNoChange('TESTCAR');
  add(s,'OPOVERDUE',days);expect(s.selectedNotices()).toHaveLength(1);
  s.componentWillUnmount();
});
test('OPN save rechecks a basket against changed expiry before any write',async()=>{
  mockDatabase.tables.City[0].opExpiryDay=7;const s=screen();add(s,'OPOLD',6);
  mockDatabase.tables.City[0].opExpiryDay=6;
  await s.processPayment();expect(mockDatabase.objects('OpReceiptHeader')).toHaveLength(0);
  expect(s.selectedNotices()).toHaveLength(1);expect(Alert.alert).toHaveBeenCalledWith(expect.stringContaining('Notice status changed'));
});
test('open OPN refreshes window and clears only unsaved basket on changed/invalid city policy',()=>{
  const saved={receiptNo:'OP-P1-9',postingPayload:'unchanged'};mockDatabase.tables.AdviceReceiptHeader=[saved];
  const s=screen();add(s,'OP1',0);expect(s.selectedNotices()).toHaveLength(1);
  mockDatabase.tables.City[0].opExpiryDay=3;s.refreshCalendar();
  expect(s.state.payableDate).toHaveLength(3);expect(s.selectedNotices()).toHaveLength(0);expect(s.state.policyMessage).toContain('refreshed');
  expect(mockDatabase.tables.AdviceReceiptHeader[0]).toBe(saved);
  mockDatabase.tables.City[0].opExpiryDay=0;s.refreshCalendar();
  expect(s.state.payableDate).toHaveLength(0);expect(s.state.policyMessage).toMatch(/Load (valid|city)/);add(s,'OP2',0);
  expect(s.selectedNotices()).toHaveLength(0);
  s.componentWillUnmount();expect(require('../src/realm').removeListener).toHaveBeenCalledWith('change',s.refreshCalendar);
});
test('missing selected city cannot collect with stale date or stale rate',()=>{
  const s=screen();mockDatabase.tables.City=[];s.refreshCalendar();add(s,'OP1',0);
  expect(s.selectedNotices()).toHaveLength(0);expect(s.state.policyMessage).toMatch(/Load (valid|city)/);
});

// A picker callback can race with a city disappearing during an atomic refresh.
test('stale city selection while overdue cannot reuse a previous city fee',()=>{
  const s=screen();s.onOpDateChange(date(20));expect(s.state.data).toHaveLength(1);
  mockDatabase.tables.City=[];expect(()=>s.onCityChange('REMOVED')).not.toThrow();
  expect(s.state.data).toHaveLength(0);expect(s.state.policyMessage).toMatch(/Load (valid|city)/);
});
