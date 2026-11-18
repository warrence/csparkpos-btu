// Synthetic-only UI/control tests. No device, production requests or printing.
import React from 'react';
import renderer from 'react-test-renderer';
import moment from 'moment';
import {Alert} from 'react-native';
import {memoryRealm} from '../test-support/memoryRealm';
import {adviceBasket, adviceItem, adviceTotals} from '../src/advice/collection';
import {advicePayload} from '../src/advice/payload';
import {saveAdviceReceipt} from '../src/advice/storage';
let mockDatabase;
const mockObjects = name => {
  const rows = mockDatabase.objects(name);
  rows.sorted = () => rows;
  const filter = rows.filtered.bind(rows);
  rows.filtered = (query, ...args) => {
    if (name === 'City') return rows.filter(row => row.code === (args[0] || query.match(/"(.*)"/)[1]));
    if (name === 'Holiday') return rows.filter(row => row.holidayDate === args[0]);
    return filter(query, ...args);
  };
  return rows;
};
jest.mock('react-native/Libraries/Components/DatePicker/DatePickerIOS.ios', () => 'DatePickerIOS');
jest.mock('../src/realm', () => ({objects: (...args) => mockObjects(...args),
  write: cb => mockDatabase.write(cb), objectForPrimaryKey: (...a) => mockDatabase.objectForPrimaryKey(...a),
  create: (name, row) => mockDatabase.create(name, name.endsWith('ReceiptHeader') && !row.items ? {...row, items: []} : row)}));
jest.mock('../src/printReceipt', () => jest.fn(() => ({print: jest.fn().mockResolvedValue(true)})));
jest.mock('axios', () => ({get: jest.fn(), post: jest.fn()}));
const OPN = require('../src/components/payments/OpnPayment').default.wrappedComponent;
const AN = require('../src/components/payments/AdviceNoticePayment').AdviceNoticePayment;
const {getOpPayableDate} = require('../src/helpers');
const {adviceIsOverdue} = require('../src/advice/rules');
const {Toast} = require('native-base');
const rules = {calendarDays: 14, overdueFee: 20, taxEnabled: true, taxPercent: 6,
  windowIncludesCollectionDate: true, rounding: 'nearest_0.05_on_notice_net_and_tax',
  collectionPolicyVersion: 3, feeBasis: 'receipt', baseAmount: 0.8, excessCharges: 1};
const find = (tree, id) => tree.root.findAll(node => node.props.testID === id)[0];
const date = days => moment().subtract(days, 'days').format('YYYY-MM-DD');
function opn() {
  const screen = new OPN();
  screen.props = {generalStore: {Tax: 6}, authStore: {userName: 'FIXTURE'}};
  screen.setState = (value, done) => { Object.assign(screen.state, value); if (done) done(); };
  screen.componentDidMount(); screen.onOpDateChange(date(0)); return screen;
}
function addOp(screen, no) { screen.onOpNoChange(no); screen.addItem(); }
function an() { return renderer.create(<AN database={mockDatabase} authStore={{userName:'FIXTURE'}} printer={{print: jest.fn().mockResolvedValue(true)}}/>); }
function addAn(screen, no, noticeDate = screen.state.noticeDate) {
  renderer.act(() => screen.setState({noticeNo: no, noticeDate, carNo: 'TESTCAR'}));
  renderer.act(() => screen.addNotice());
}
const RealDate = Date;
let instant;
function now(value) {
  instant = new RealDate(value).getTime();
  global.Date = class extends RealDate { constructor(...args) { super(...(args.length ? args : [instant])); } static now() { return instant; } };
}
beforeEach(() => {
  now('2026-10-09T04:00:00Z');
  mockDatabase=memoryRealm();
  mockDatabase.tables.City=[{code:'BTU',opExpiryDay:3,expiryPaRate:10}];
  mockDatabase.tables.OpTable=[{amount:0.8}];
  mockDatabase.tables.HolidayCalendar[0].json=JSON.stringify(['2026-10-10','2026-10-11']);
  mockDatabase.tables.AdviceRules[0].json=JSON.stringify({protocolVersion:1,configured:true,rules:{...rules,calendarDays:3}});
  jest.spyOn(Alert,'alert').mockImplementation(()=>{});jest.spyOn(Toast,'show').mockImplementation(()=>{});
});
afterEach(()=>{global.Date=RealDate;jest.restoreAllMocks();});
function form(kind) {
 const tree=kind==='AN'?an():renderer.create(<OPN generalStore={{Tax:6}} authStore={{userName:'FIXTURE'}}/>);
 const screen=tree.getInstance();
 return {tree,screen,enter:day=>renderer.act(()=>kind==='AN'?screen.change('noticeDate',day):screen.onOpDateChange(day)),
 add:no=>{renderer.act(()=>kind==='AN'?screen.change('noticeNo',no):screen.onOpNoChange(no));renderer.act(()=>kind==='AN'?screen.change('carNo','QA'):screen.onCarNoChange('QA'));renderer.act(()=>kind==='AN'?screen.addNotice():screen.addItem());},
 rows:()=>kind==='AN'?screen.state.items:screen.selectedNotices(),
 pay:()=>kind==='AN'?screen.pay():screen.processPayment()};
}
test.each(['OP','AN'])('%s automatically uses inclusive holiday-adjusted boundary and repeated edits do not strand fees',kind=>{
 const f=form(kind);const {screen,tree}=f;
 expect(find(tree,kind==='AN'?'advice-add':'opn-add').props.disabled).toBe(true);
 expect(JSON.stringify(tree.toJSON())).not.toContain('Last holiday download');
 expect(tree.root.findAll(node=>node.type&&node.type.name==='CheckBox')).toHaveLength(0);
 f.enter('2026-10-07');expect(screen.state.overdue).toBe(false);
 now('2026-10-11T04:00:00Z');f.enter('2026-10-07');expect(screen.state.overdue).toBe(false);
 now('2026-10-12T04:00:00Z');f.enter('2026-10-07');expect(screen.state.overdue).toBe(true);
 f.enter('2026-10-12');expect(screen.state.overdue).toBe(false);
 f.enter('2026-10-07');f.enter('2026-10-07');expect(screen.state.overdue).toBe(true);
 if(kind==='OP')expect(screen.state.data.filter(row=>row.opNo==='Overdue Charges')).toHaveLength(1);
 else expect(find(tree,'advice-overdue-charge-amount').props.children).toBe('20.00');
 f.enter('');expect(find(tree,kind==='AN'?'advice-add':'opn-add').props.disabled).toBe(true);tree.unmount();
});
test.each(['OP','AN'])('%s holiday issue date contributes zero and unlisted weekends count',kind=>{
 now('2026-10-14T04:00:00Z');const f=form(kind);f.enter('2026-10-10');expect(f.screen.state.overdue).toBe(false);
 now('2026-10-15T04:00:00Z');f.enter('2026-10-10');expect(f.screen.state.overdue).toBe(true);
 mockDatabase.tables.HolidayCalendar[0].json='[]';now('2026-10-11T04:00:00Z');f.enter('2026-10-07');expect(f.screen.state.overdue).toBe(true);f.tree.unmount();
});
test.each(['OP','AN'])('%s blocks missing calendar/date and future dates without saving',async kind=>{
 const f=form(kind);f.add('MISSING');expect(f.rows()).toHaveLength(0);
 f.enter('2026-10-10');f.add('FUTURE');expect(f.rows()).toHaveLength(0);
 mockDatabase.tables.HolidayCalendar=[];mockDatabase.tables.Holiday=[];f.enter('2026-10-07');f.add('UNKNOWN');expect(f.rows()).toHaveLength(0);
 await f.pay();expect(mockDatabase.objects(kind==='AN'?'AdviceReceiptHeader':'PaReceiptHeader')).toHaveLength(0);f.tree.unmount();
});
test.each(['OP','AN'])('%s rejects mixing normal and overdue dates, then blocks rollover without altering history',async kind=>{
 const old={receiptNo:'HISTORY',postingPayload:'UNCHANGED'};mockDatabase.tables.AdviceReceiptHeader=[old];
 const f=form(kind);f.enter('2026-10-07');f.add('NORMAL');expect(f.rows()).toHaveLength(1);
 f.enter('2026-10-01');f.add('OLD');expect(f.rows()).toHaveLength(1);
 now('2026-10-12T04:00:00Z');renderer.act(()=>f.screen.refreshDateStatus());
 expect(find(f.tree,kind==='AN'?'advice-pay':'opn-pay').props.disabled).toBe(true);
 await f.pay();expect(mockDatabase.objects(kind==='AN'?'AdviceReceiptHeader':'PaReceiptHeader')).toHaveLength(kind==='AN'?1:0);
 expect(mockDatabase.tables.AdviceReceiptHeader[0]).toBe(old);expect(old.postingPayload).toBe('UNCHANGED');f.tree.unmount();
});
test.each([0,null,undefined,'bad'])('OP invalid expiry %s blocks automatic collection',value=>{
 mockDatabase.tables.City[0].opExpiryDay=value;const f=form('OP');f.enter('2026-10-07');f.add('NOSETTING');expect(f.rows()).toHaveLength(0);f.tree.unmount();
});
test('OP missing overdue fee cannot add an overdue notice with a zero guessed charge',()=>{
 mockDatabase.tables.City[0].expiryPaRate=null;const f=form('OP');f.enter('2026-10-01');f.add('NOFEE');expect(f.rows()).toHaveLength(0);expect(find(f.tree,'opn-add').props.disabled).toBe(true);f.tree.unmount();
});
test('Kuching midnight refresh reschedules and unmount cancels it',()=>{
 jest.useFakeTimers();now('2026-10-09T15:59:59Z');
 const refresh=jest.fn();const stop=require('../src/payments/dayRollover').watchKuchingDay(refresh);
 jest.advanceTimersByTime(999);expect(refresh).not.toHaveBeenCalled();
 now('2026-10-09T16:00:00Z');jest.advanceTimersByTime(1);expect(refresh).toHaveBeenCalledTimes(1);
 stop();jest.advanceTimersByTime(86400000);expect(refresh).toHaveBeenCalledTimes(1);jest.useRealTimers();
});
