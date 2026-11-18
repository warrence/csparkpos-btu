import {paItems} from '../src/payments/paReceipts';
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
beforeEach(() => {
  mockDatabase = memoryRealm();
  mockDatabase.tables.City = [{code:'BTU', opExpiryDay:14, expiryPaRate:10}];
  mockDatabase.tables.OpTable = [{amount:0.8}];
  mockDatabase.tables.AdviceRules[0].json = JSON.stringify({protocolVersion:1,configured:true,rules});
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  jest.spyOn(Toast, 'show').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

test('OPN follows owner-confirmed city calendar days; weekends and cached holidays count', () => {
  const now = new Date('2026-10-17T04:00:00Z');
  const dates = getOpPayableDate('BTU', now).map(day => day.format('YYYY-MM-DD'));
  expect(dates).toHaveLength(14); expect(dates[0]).toBe('2026-10-17'); expect(dates[13]).toBe('2026-10-04');
  expect(dates).toContain('2026-10-10'); expect(dates).toContain('2026-10-11');
  mockDatabase.tables.Holiday = [{holidayDate:'2026-10-16'}];
  expect(getOpPayableDate('BTU',now).map(day => day.format('YYYY-MM-DD'))).toEqual(dates);
  expect(adviceIsOverdue('2026-10-04', rules, now)).toBe(false); expect(adviceIsOverdue('2026-10-03', rules, now)).toBe(true);
});
test('AN shows one separate fee, normal notice prices and unchanged canonical payload allocation', async () => {
  const tree = an(), screen = tree.getInstance();
  renderer.act(() => screen.change('noticeDate',date(15)));
  expect(find(tree, 'advice-overdue-charge-amount').props.children).toBe('20.00');
  addAn(screen, 'ANB', date(15)); addAn(screen, 'ANA');
  expect(find(tree,'advice-notice-price-ANA').props.children).toBe('1.85');
  expect(find(tree,'advice-notice-price-ANB').props.children).toBe('1.85');
  const allocated = adviceBasket(screen.state.items, true, rules.feeBasis);
  expect(adviceTotals(allocated).total).toBe(2370);
  const expected = advicePayload({receiptNo:'PA-P1-71',receiptDate:new Date(),userName:'FIXTURE',pondokId:'P1',
    city:'BTU',carNo:'TESTCAR',overdue:true,totalAmount:23.7,rounding:0,rulesSnapshot:JSON.stringify(rules),items:allocated});
  await screen.pay();
  const saved = mockDatabase.objects('AdviceReceiptHeader')[0], actual = JSON.parse(saved.postingPayload);
  expected.receiptDate = actual.receiptDate;
  expect(actual).toEqual(expected); expect(actual.items).toHaveLength(2);
  expect(actual.items.map(row => row.compoundAmount)).toEqual(['20.00','0.00']);
  expect(actual.items.every(row => row.couponNo === '')).toBe(true); tree.unmount();
});
test('AN date/vehicle/city cannot change with overdue notices; correct sorted notice removes', () => {
  const tree=an(), screen=tree.getInstance(); renderer.act(() => screen.change('noticeDate',date(15)));
  const selected=date(15); addAn(screen,'ANZ',selected); addAn(screen,'ANA');
  expect(find(tree,'advice-date-field').props.disabled).toBe(true);
  renderer.act(() => {screen.change('noticeDate',date(20));screen.change('carNo','OTHER');screen.change('city','OTHER');});
  expect(screen.state.noticeDate).toBe(selected); expect(screen.state.overdue).toBe(true); expect(screen.state.carNo).toBe('TESTCAR'); expect(screen.state.city).toBe('BTU');
  renderer.act(() => find(tree,'advice-remove-ANA').props.onPress());
  expect(screen.state.items.map(row=>row.noticeNo)).toEqual(['ANZ']);
  expect(find(tree,'advice-date-field').props.disabled).toBe(true);
  renderer.act(() => screen.removeNotice('ANZ'));
  expect(find(tree,'advice-date-field').props.disabled).toBe(false);
  renderer.act(() => screen.change('noticeDate',date(20))); expect(screen.state.noticeDate).toBe(date(20));
  renderer.act(() => screen.change('noticeDate',date(0)));expect(screen.state.overdue).toBe(false);tree.unmount();
});
test('AN storage rejects new overdue mixed dates and UI rejects stale date callbacks; no saved receipt', () => {
  const tree=an(),screen=tree.getInstance();renderer.act(()=>screen.change('noticeDate',date(15))); addAn(screen,'AN1',date(15));
  addAn(screen,'AN2',date(16));expect(screen.state.items).toHaveLength(1);expect(screen.state.message).toContain('one notice date');
  const items=[15,16].map((days,i)=>adviceItem({noticeNo:`AN${i}`,city:'BTU',carNo:'TESTCAR',noticeDate:date(days)},rules,true));
  expect(()=>saveAdviceReceipt(mockDatabase,{items,overdue:true,userName:'FIXTURE',rules})).toThrow('one notice date');
  expect(mockDatabase.objects('AdviceReceiptHeader')).toHaveLength(0);tree.unmount();
});
test('current AN dates remain selectable, no surcharge; overdue 13 notices preserve cumulative tax/rounding', () => {
  const tree=an(),screen=tree.getInstance();addAn(screen,'AN1',date(0));
  renderer.act(()=>screen.change('noticeDate',date(1)));addAn(screen,'AN2');
  expect(screen.state.items).toHaveLength(2);expect(find(tree,'advice-date-field').props.disabled).toBe(false);
  expect(find(tree,'advice-overdue-charge-row')).toBeUndefined();
  expect(adviceTotals(adviceBasket(screen.state.items,false,'receipt')).total).toBe(370);
  renderer.act(()=>screen.clearForm());renderer.act(()=>screen.change('noticeDate',date(15)));
  for(let i=0;i<13;i++) addAn(screen,`AN${String(i).padStart(2,'0')}`,date(15));
  const totals=adviceTotals(adviceBasket(screen.state.items,true,'receipt'));
  expect(totals).toMatchObject({tax:62,overdue:2000,rounding:-2,total:4400});tree.unmount();
});
test('OPN repeated date edits without notices never duplicates or strands fee and cannot collect fee alone', async () => {
  const screen=opn();screen.onOpDateChange(date(20));expect(screen.state.data).toHaveLength(1);
  await screen.processPayment();expect(mockDatabase.objects('PaReceiptHeader')).toHaveLength(0);
  screen.onOpDateChange(date(0));expect(screen.state.data).toEqual([]);expect(screen.state.overdue).toBe(false);
  screen.onOpDateChange(date(20));screen.onOpDateChange(date(0));screen.onOpDateChange(date(20));
  expect(screen.state.data).toHaveLength(1);expect(screen.state.data[0].price).toBe(10);
});
test('OPN locks overdue date/vehicle/city until last notice removed, with one fee throughout', async () => {
  const screen=opn();screen.onOpDateChange(date(20));screen.onCarNoChange('TESTCAR');screen.onOpDateChange(date(20));addOp(screen,'OP1');
  const selected=screen.state.opDate;expect(screen.renderDatePicker().props.disabled).toBe(true);
  screen.onOpDateChange(date(20));screen.onOpDateChange(date(21));screen.onCarNoChange('OTHER');screen.onCityChange('OTHER');
  expect(screen.state.overdue).toBe(true);expect(screen.state.opDate).toBe(selected);expect(screen.state.carNo).toBe('TESTCAR');expect(screen.state.city).toBe('BTU');
  addOp(screen,'OP2');expect(screen.state.data.filter(item=>item.opNo==='Overdue Charges')).toHaveLength(1);
  expect(Number(screen.state.total)).toBe(11.7);
  screen.deleteItem(screen.selectedNotices()[0]);expect(screen.renderDatePicker().props.disabled).toBe(true);
  expect(Number(screen.state.total)).toBe(10.85);
  screen.deleteItem(screen.selectedNotices()[0]);expect(screen.renderDatePicker().props.disabled).toBe(false);
  screen.onOpDateChange(date(21));expect(screen.state.opDate).toBe(date(21));
  screen.onOpDateChange(date(0));expect(screen.state.data).toEqual([]);
});
test('OPN keeps normal notice amounts and stores one surcharge for multi-notice overdue payment', async () => {
  const screen=opn();screen.onOpDateChange(date(20));screen.onCarNoChange('TESTCAR');screen.onOpDateChange(date(20));addOp(screen,'OP1');addOp(screen,'OP2');
  expect(screen.selectedNotices().map(row=>row.price)).toEqual([0.8,0.8]);
  await screen.processPayment();const header=mockDatabase.objects('PaReceiptHeader')[0];
  expect(paItems(header)).toHaveLength(2);expect(paItems(header).map(row=>row.amount)).toEqual([10,0]);
  expect(paItems(header).map(row=>row.opAmount)).toEqual([0.8,0.8]);
});
test('OPN current notices may use different selectable dates; overdue stale mismatch fails closed', async () => {
  const screen=opn();addOp(screen,'OP1');screen.onOpDateChange(date(1));addOp(screen,'OP2');expect(screen.selectedNotices()).toHaveLength(2);
  expect(screen.state.data.filter(row=>row.opNo==='Overdue Charges')).toHaveLength(0);
  screen.clearForm();screen.onOpDateChange(date(20));screen.onCarNoChange('TESTCAR');screen.onOpDateChange(date(20));addOp(screen,'OP3');
  screen.state.opDate=date(21);addOp(screen,'OP4');expect(screen.selectedNotices()).toHaveLength(1);
  await screen.processPayment();expect(mockDatabase.objects('PaReceiptHeader')).toHaveLength(0);
});
