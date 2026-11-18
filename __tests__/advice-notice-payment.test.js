import React from 'react';
import renderer from 'react-test-renderer';
import moment from 'moment';
import {AdviceNoticePayment} from '../src/components/payments/AdviceNoticePayment';
import {memoryRealm as legacyRealm, RULES} from '../test-support/memoryRealm';
const fixedRules = {...RULES, collectionPolicyVersion: 3, baseAmount: 0.8, excessCharges: 1, feeBasis: 'receipt', taxPercent: 6};
const memoryRealm = () => {const db=legacyRealm();db.tables.AdviceRules[0].json=JSON.stringify({protocolVersion:1,configured:true,rules:fixedRules});return db;};

jest.mock('react-native/Libraries/Components/DatePicker/DatePickerIOS.ios', () => 'DatePickerIOS');
jest.mock('axios', () => ({get: jest.fn(), post: jest.fn()}));
jest.mock('../src/realm', () => ({objects: () => []}));
jest.mock('../src/printReceipt', () => jest.fn());

const find = (tree, id) => tree.root.findAll(node => node.props.testID === id)[0];

test('an open tab refreshes downloaded policy and disables collection when office removes configuration', () => {
  const db = memoryRealm();db.addListener = jest.fn();db.removeListener = jest.fn();
  const tree = renderer.create(<AdviceNoticePayment database={db} authStore={{userName: 'U1'}} />);
  const screen = tree.getInstance();
  expect(db.addListener).toHaveBeenCalledWith('change', screen.refreshConfiguration);
  db.tables.AdviceRules[0].json = JSON.stringify({protocolVersion: 1, configured: false});
  renderer.act(() => screen.refreshConfiguration());
  expect(find(tree, 'advice-pay').props.disabled).toBe(true);
  expect(find(tree, 'advice-add').props.disabled).toBe(true);
  expect(screen.state.rules).toBeUndefined();
  tree.unmount();
  expect(db.removeListener).toHaveBeenCalledWith('change', screen.refreshConfiguration);
});

test('collection is disabled without downloaded rules and makes no network request', async () => {
  const db = memoryRealm();db.tables.AdviceRules = [];
  const tree = renderer.create(<AdviceNoticePayment database={db} authStore={{userName: 'U1'}} />);
  expect(find(tree, 'advice-pay').props.disabled).toBe(true);
  expect(find(tree, 'advice-add').props.disabled).toBe(true);
  expect(find(tree, 'advice-noticeNo').props.editable).toBe(false);
  await tree.getInstance().pay();
  expect(db.objects('AdviceReceiptHeader')).toHaveLength(0);
  expect(require('axios').get).not.toHaveBeenCalled();expect(require('axios').post).not.toHaveBeenCalled();
  tree.unmount();
});

test('cash collection remains saved when printing fails; reprint never recollects or calls the network', async () => {
  const db = memoryRealm();const printer = {print: jest.fn().mockRejectedValueOnce(new Error('printer offline')).mockResolvedValueOnce(true)};
  const tree = renderer.create(<AdviceNoticePayment database={db} authStore={{userName: 'U1'}} printer={printer} />);
  const screen = tree.getInstance();
  renderer.act(() => screen.setState({noticeNo: 'AN1', noticeDate: moment().format('YYYY-MM-DD'), carNo: 'Q123', baseAmount: '1', excessCharge: '0.20', taxRate: '6', taxAmount: '0.06'}));
  renderer.act(() => screen.addNotice());
  renderer.act(() => screen.change('amountReceived', '2'));
  await screen.pay();
  expect(db.objects('AdviceReceiptHeader')).toHaveLength(1);
  expect(db.objects('AdviceReceiptHeader')[0].status).toBe('pending');
  expect(screen.state.message).toContain('is saved. Printing failed');
  expect(screen.state.items).toHaveLength(0);
  await screen.reprint();
  expect(db.objects('AdviceReceiptHeader')).toHaveLength(1);
  expect(printer.print.mock.calls).toEqual([['an', 'OP-P1-41'], ['an', 'OP-P1-41']]);
  expect(require('axios').post).not.toHaveBeenCalled();
  tree.unmount();
});

test('rapid Pay taps create one receipt; restart fixture restores reprint without another collection', async () => {
  const db = memoryRealm();let finishPrint;
  const printer = {print: jest.fn(() => new Promise(resolve => {finishPrint = resolve;}))};
  const tree = renderer.create(<AdviceNoticePayment database={db} authStore={{userName: 'U1'}} printer={printer} />);
  const screen = tree.getInstance();
  renderer.act(() => screen.setState({noticeNo: 'ANTAPS', noticeDate: moment().format('YYYY-MM-DD'), carNo: 'Q123', baseAmount: '1', excessCharge: '0', taxRate: '0', taxAmount: '0', amountReceived: '2'}));
  renderer.act(() => screen.addNotice());
  const first = screen.pay();await screen.pay();
  expect(db.objects('AdviceReceiptHeader')).toHaveLength(1);
  expect(db.objects('GeneralProfile')[0].OpReceiptNo).toBe(41);
  expect(printer.print).toHaveBeenCalledTimes(1);
  finishPrint(true);await first;tree.unmount();
  // Simulate rehydration from stored values, not actual Realm disk persistence.
  const reopened = memoryRealm();
  reopened.tables = JSON.parse(JSON.stringify(db.tables), (key, value) =>
    ['receiptDate', 'noticeDate', 'loadedAt', 'postedAt'].includes(key) && value ? new Date(value) : value);
  const original = reopened.objects('AdviceReceiptHeader')[0].postingPayload;
  const reprint = {print: jest.fn().mockResolvedValue(true)};
  const restarted = renderer.create(<AdviceNoticePayment database={reopened} authStore={{userName: 'U1'}} printer={reprint} />);
  expect(restarted.getInstance().state.lastReceiptNo).toBe('OP-P1-41');
  await restarted.getInstance().reprint();
  expect(reprint.print).toHaveBeenCalledWith('an', 'OP-P1-41');
  expect(reopened.objects('AdviceReceiptHeader')).toHaveLength(1);
  expect(reopened.objects('AdviceReceiptHeader')[0].postingPayload).toBe(original);
  restarted.unmount();
});


test('OPN-style controls clear only the basket and open a reprint dialog without collection', () => {
  const db=memoryRealm();const tree=renderer.create(<AdviceNoticePayment database={db} authStore={{userName:'FIXTURE'}}/>);
  const screen=tree.getInstance();
  renderer.act(()=>screen.setState({noticeNo:'ANFIX1',carNo:'TESTCAR',lastReceiptNo:'OP-P1-41',amountReceived:'2'}));
  renderer.act(()=>screen.clearForm());
  expect(screen.state.carNo).toBe('');expect(screen.state.noticeNo).toBe('');expect(screen.state.amountReceived).toBe('');
  expect(screen.state.lastReceiptNo).toBe('OP-P1-41');expect(db.objects('AdviceReceiptHeader')).toHaveLength(0);
  renderer.act(()=>find(tree,'advice-reprint').props.onPress());expect(screen.state.reprintDialogVisible).toBe(true);
  tree.unmount();
});


test('fixed-policy screen has automatic Overdue and no editable coupon, base, excess or tax fields', () => {
  const tree=renderer.create(<AdviceNoticePayment database={memoryRealm()} authStore={{userName:'FIXTURE'}}/>);
  ['couponNo','baseAmount','excessCharge','taxRate','taxAmount'].forEach(name=>expect(tree.root.findAll(node=>node.props.testID==='advice-'+name)).toHaveLength(0));
  const screen=tree.getInstance();renderer.act(()=>screen.change('noticeDate',moment().subtract(20,'days').format('YYYY-MM-DD')));expect(screen.state.overdue).toBe(true);
  renderer.act(()=>screen.setState({items:[{noticeNo:'ANFIX1',noticeDate:new Date(),city:'BTU',carNo:'TESTCAR',couponNo:'',baseAmount:0.8,excessCharge:1,taxRate:6,taxAmount:0.05,overdueFee:7.02}]}));renderer.act(()=>screen.change('noticeDate',moment().subtract(20,'days').format('YYYY-MM-DD')));expect(screen.state.overdue).toBe(true);
  tree.unmount();
});

test('legacy or incomplete cached rules cannot enable new fixed-policy collection', () => {
  for (const rules of [RULES,{...fixedRules,baseAmount:null},{...fixedRules,excessCharges:undefined},{...fixedRules,taxPercent:undefined}]) {
    const db=memoryRealm();db.tables.AdviceRules[0].json=JSON.stringify({protocolVersion:1,configured:true,rules});
    const tree=renderer.create(<AdviceNoticePayment database={db} authStore={{userName:'FIXTURE'}}/>);
    expect(find(tree,'advice-add').props.disabled).toBe(true);expect(find(tree,'advice-pay').props.disabled).toBe(true);tree.unmount();
  }
});

test.each([false, true])('bordered date textbox opens picker and selects a notice date; blank Received saves without inventing tender (overdue %s)', async overdue => {
  const db = memoryRealm();const printer = {print: jest.fn().mockResolvedValue(true)};
  const tree = renderer.create(<AdviceNoticePayment database={db} authStore={{userName:'FIXTURE'}} printer={printer}/>);
  const screen = tree.getInstance();
  const date = moment().subtract(overdue ? fixedRules.calendarDays : 0, 'days').toDate();
  const picker = tree.root.findAll(node => node.props.androidMode === 'default')[0];
  const open = jest.spyOn(screen.datePicker, 'showDatePicker').mockImplementation(() => {});
  const field = find(tree, 'advice-date-field');
  expect(field.props.style.borderWidth).toBe(1);expect(field.props.accessibilityRole).toBe('button');
  renderer.act(() => field.props.onPress());expect(open).toHaveBeenCalledTimes(1);
  renderer.act(() => picker.props.onDateChange(date));
  expect(find(tree,'advice-date-value').props.children).toBe(moment(date).format('DD/MM/YYYY'));
  renderer.act(() => screen.setState({noticeNo:'ANDATE1',carNo:'TESTCAR'}));
  renderer.act(() => screen.addNotice());
  expect(screen.state.items).toHaveLength(1);expect(screen.state.amountReceived).toBe('');
  await screen.pay();
  const receipt = db.objects('AdviceReceiptHeader')[0];
  expect(receipt.amountReceived).toBeNull();expect(receipt.overdue).toBe(overdue);
  expect(receipt.totalAmount).toBe(overdue ? 8.87 : 1.85); // synthetic configured overdue fee 7.02
  expect(JSON.parse(receipt.postingPayload).totalAmount).toBe(overdue ? '8.87' : '1.85');
  expect(screen.state.message).toContain('Saved');expect(screen.state.message).not.toContain('Change:');
  expect(printer.print).toHaveBeenCalledTimes(1);tree.unmount();
});

test.each(['0', '1', 'oops', '-1', '1.001'])('entered invalid or insufficient tender %s retains basket and never prints', async value => {
  const db=memoryRealm(),printer={print:jest.fn()};
  const tree=renderer.create(<AdviceNoticePayment database={db} authStore={{userName:'FIXTURE'}} printer={printer}/>);
  const screen=tree.getInstance();
  renderer.act(()=>screen.setState({noticeNo:'ANBADTENDER',carNo:'TESTCAR',noticeDate:moment().format('YYYY-MM-DD'),amountReceived:value}));
  renderer.act(()=>screen.addNotice());await screen.pay();
  expect(db.objects('AdviceReceiptHeader')).toHaveLength(0);expect(screen.state.items).toHaveLength(1);
  expect(db.objects('GeneralProfile')[0].OpReceiptNo).toBe(40);expect(printer.print).not.toHaveBeenCalled();tree.unmount();
});

test('new client fails closed on old policy2 rules while preserving pending receipts for original upload',()=>{
 const db=memoryRealm();db.tables.AdviceRules[0].json=JSON.stringify({protocolVersion:1,configured:true,rules:{...fixedRules,collectionPolicyVersion:2}});
 const tree=renderer.create(<AdviceNoticePayment database={db} authStore={{userName:'FIXTURE'}}/>);
 expect(tree.getInstance().state.message).toContain('per-notice tax policy');expect(find(tree,'advice-pay').props.disabled).toBe(true);expect(find(tree,'advice-add').props.disabled).toBe(true);tree.unmount();
});
