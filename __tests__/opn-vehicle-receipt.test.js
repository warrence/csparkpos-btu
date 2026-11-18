// Synthetic data and mocked printer only. Never collect or print a live payment.
import moment from 'moment';
import {Alert} from 'react-native';
import {memoryRealm} from '../test-support/memoryRealm';
import {legacyOpReceiptPayload} from '../src/payments/legacyPosting';
import {sharedOpnVehicle} from '../src/payments/opnVehicle';
let mockDatabase;
const mockObjects = name => {
  const rows = mockDatabase.objects(name);
  rows.sorted = () => rows;
  return rows;
};
jest.mock('react-native/Libraries/Components/DatePicker/DatePickerIOS.ios', () => 'DatePickerIOS');
jest.mock('../src/realm', () => ({objects: name => mockObjects(name),
  objectForPrimaryKey: (...args) => mockDatabase.objectForPrimaryKey(...args),
  write: callback => mockDatabase.write(callback),
  create: (name, row) => mockDatabase.create(name, name.endsWith('ReceiptHeader') && !row.items ? {...row, items: []} : row)}));
jest.mock('react-native-bluetooth-serial', () => ({write: jest.fn().mockResolvedValue(true), isConnected: jest.fn().mockResolvedValue(true)}));
jest.mock('axios', () => ({get: jest.fn(), post: jest.fn()}));
const OPN = require('../src/components/payments/OpnPayment').default.wrappedComponent;
const PrintReceipt = require('../src/printReceipt').default;
const Bluetooth = require('react-native-bluetooth-serial');
const {Toast} = require('native-base');
const date = days => moment().subtract(days, 'days').format('YYYY-MM-DD');
function screen() {
  const result = new OPN();
  result.props = {generalStore: {Tax: 6}, authStore: {userName: 'FIXTURE'}};
  result.setState = (value, done) => {Object.assign(result.state, value); if (done) done();};
  result.onOpDateChange(date(0));
  return result;
}
function add(view, no, day = date(0)) {
  view.onOpDateChange(day); view.onOpNoChange(no); view.addItem();
}
function oldReceipt(carNo) {
  return {receiptNo: 'OP-P1-1', userName: 'FIXTURE', city: 'BTU', pondokId: 'P1',
    receiptDate: new Date('2026-10-29T04:00:00Z'), taxPolicyVersion: 3, carNo,
    items: [{opNo: 'OPHISTORY', opDate: new Date('2026-10-28T04:00:00Z'), amount: .8, taxAmount: .05, tax: 6}]};
}
beforeEach(() => {
  mockDatabase = memoryRealm();
  mockDatabase.tables.OpTable = [{amount: .8}];
  Object.assign(mockDatabase.tables.GeneralProfile[0], {Tax: 6, companyName: 'SYNTHETIC ONLY', CompanyNo: 'FIXTURE',
    GstRegNo: '', Address1: '', Address2: '', Address3: '', Telephone1: '', Telephone2: null, Telephone3: ''});
  Bluetooth.write.mockReset().mockResolvedValue(true);
  Bluetooth.isConnected.mockReset().mockResolvedValue(true);
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  jest.spyOn(Toast, 'show').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

test('normal OPN saves shared basket vehicle and prints it after City, including later reprints', async () => {
  const view = screen(); view.onCarNoChange('QAB1234');
  add(view, 'OPVEH1'); add(view, 'OPVEH2', date(1));
  expect(view.selectedNotices().map(row => row.opDate)).toEqual([date(0), date(1)]);
  await view.processPayment();
  const receipt = mockDatabase.objects('OpReceiptHeader')[0];
  expect(receipt.carNo).toBe('QAB1234'); expect(receipt.items).toHaveLength(2);
  const initial = Bluetooth.write.mock.calls[0][0];
  expect(initial).toContain('Vehicle Reg. No: QAB1234');
  expect(initial.indexOf('City: BTU')).toBeLessThan(initial.indexOf('Vehicle Reg. No:'));
  expect(initial.indexOf('Vehicle Reg. No:')).toBeLessThan(initial.indexOf('OPN No.'));
  expect(initial).toMatch(/Net Total:\s+1\.70/);
  const before = JSON.stringify(mockDatabase.tables);
  view.onCarNoChange('OTHER999'); await view.handleReprint();
  expect(Bluetooth.write.mock.calls[1][0]).toBe(initial);
  expect(JSON.stringify(mockDatabase.tables)).toBe(before);
});

test('normal vehicle and dates remain editable; mixed and blank notices collect without mislabeling', async () => {
  const view = screen(); view.onCarNoChange('QAB1234'); add(view, 'OPMIX1');
  view.onCarNoChange('OTHER'); expect(view.state.carNo).toBe('OTHER');
  add(view, 'OPMIX2', date(1)); view.onCarNoChange(''); add(view, 'OPBLANK');
  expect(view.renderDatePicker().props.disabled).toBe(false);
  view.onCarNoChange('UNSAVED-DRAFT');
  await view.processPayment();
  const row = mockDatabase.objects('OpReceiptHeader')[0];
  expect(row.carNo).toBeNull();
  expect(row.items.map(item => item.carNo)).toEqual(['QAB1234', 'OTHER', null]);
  const output = Bluetooth.write.mock.calls[0][0];
  expect(output.indexOf('OPN No.')).toBeLessThan(output.indexOf('Vehicle Reg. No:'));
  expect(output.indexOf('OPMIX1')).toBeLessThan(output.indexOf('Vehicle Reg. No: QAB1234'));
  expect(output.indexOf('Vehicle Reg. No: QAB1234')).toBeLessThan(output.indexOf('OPMIX2'));
  expect(output.indexOf('OPMIX2')).toBeLessThan(output.indexOf('Vehicle Reg. No: OTHER'));
  expect(output).not.toContain('UNSAVED-DRAFT');
  const wire = legacyOpReceiptPayload(row);
  expect(wire).not.toHaveProperty('carNo');
  expect(wire.items[0].carNo).toBe('QAB1234'); expect(wire.items[1].carNo).toBe('OTHER');
  expect(wire.items[2]).not.toHaveProperty('carNo');
  await view.handleReprint(); expect(Bluetooth.write.mock.calls[1][0]).toBe(output);
});

test.each(['', '   ', null])('blank optional normal OPN vehicle %j can add and collect', async vehicle => {
  const view = screen(); view.onCarNoChange(vehicle); add(view, 'OPEMPTY');
  expect(view.selectedNotices()).toHaveLength(1); await view.processPayment();
  const row = mockDatabase.objects('OpReceiptHeader')[0]; expect(row).toBeDefined();
  expect(row.carNo).toBeNull(); expect(Bluetooth.write.mock.calls[0][0]).not.toContain('Vehicle Reg. No:');
  expect(legacyOpReceiptPayload(row)).not.toHaveProperty('carNo');
  expect(legacyOpReceiptPayload(row).items[0]).not.toHaveProperty('carNo');
});

test('printer failure retains saved plate, and retry prints it without another collection', async () => {
  const view = screen(); view.onCarNoChange('QAB1234'); add(view, 'OPRETRY');
  Bluetooth.write.mockRejectedValueOnce(new Error('synthetic offline printer'));
  await view.processPayment();
  expect(mockDatabase.objects('OpReceiptHeader')).toHaveLength(1);
  const counter = mockDatabase.tables.GeneralProfile[0].OpReceiptNo;
  view.onCarNoChange('OTHER'); await view.handleReprint();
  expect(Bluetooth.write.mock.calls[1][0]).toContain('Vehicle Reg. No: QAB1234');
  expect(mockDatabase.objects('OpReceiptHeader')).toHaveLength(1);
  expect(mockDatabase.tables.GeneralProfile[0].OpReceiptNo).toBe(counter);
});

test.each([undefined, null, '', '   '])('historical receipt with missing vehicle %j reprints without inventing or changing data', async vehicle => {
  const row = oldReceipt(vehicle); mockDatabase.tables.OpReceiptHeader = [row];
  const before = JSON.stringify(row); await new PrintReceipt().print('op', row.receiptNo);
  const output = Bluetooth.write.mock.calls[0][0];
  expect(output).not.toContain('Vehicle Reg. No:');
  expect(output).not.toContain('undefined'); expect(output).not.toContain('null');
  expect(output).toMatch(/Net Total:\s+0\.85/); expect(JSON.stringify(row)).toBe(before);
});

test('transport adds only recorded optional plates and preserves all identity/date/money fields', () => {
  const row = oldReceipt(' qab 1234 '); row.items[0].carNo = ' qab 1234 ';
  const before = JSON.stringify(row); const wire = legacyOpReceiptPayload(row);
  expect(wire.carNo).toBe(' qab 1234 '); expect(wire.items[0].carNo).toBe(' qab 1234 ');
  expect(wire).not.toHaveProperty('taxPolicyVersion');
  const expected = {...row}; delete expected.taxPolicyVersion;
  expect(wire).toEqual(expected); expect(JSON.stringify(row)).toBe(before);
});

test.each([undefined, null, '', '   '])('historical plate %j does not change old wire payload', plate => {
  const row = oldReceipt(plate); row.items[0].carNo = plate;
  const expected = {...row, items: row.items.map(({carNo, ...item}) => item)};
  delete expected.carNo; delete expected.taxPolicyVersion;
  expect(legacyOpReceiptPayload(row)).toEqual(expected);
});

test('shared vehicle requires every item to have the same recorded nonblank plate', () => {
  expect(sharedOpnVehicle([{carNo:'A'}, {carNo:'A'}])).toBe('A');
  expect(sharedOpnVehicle([{carNo:'A'}, {carNo:''}])).toBeNull();
  expect(sharedOpnVehicle([{carNo:'A'}, {carNo:'B'}])).toBeNull();
  expect(sharedOpnVehicle([])).toBeNull();
});

test('actual normal OPN screen resolves duplicate to saved receipt and offers Cancel/Reprint without recollection',async()=>{
 const view=screen();add(view,'OP-DUPLICATE');await view.processPayment();const saved=mockDatabase.objects('OpReceiptHeader')[0];
 const before=JSON.stringify(mockDatabase.tables),original=Bluetooth.write.mock.calls[0][0];Alert.alert.mockClear();
 add(view,'OP-DUPLICATE');await view.processPayment();const [message,prompt,buttons]=Alert.alert.mock.calls[0];
 expect(message).toContain(saved.receiptNo);expect(message).toContain('No new receipt was saved');expect(buttons[0].text).toBe('Cancel');expect(buttons[1].text).toBe('Reprint');expect(JSON.stringify(mockDatabase.tables)).toBe(before);
 await buttons[1].onPress();expect(Bluetooth.write.mock.calls[1][0]).toBe(original);expect(JSON.stringify(mockDatabase.tables)).toBe(before);
});

test('actual normal OPN posted/orphan item produces Office review instead of raw primary-key error or invented reprint',async()=>{
 mockDatabase.tables.OpReceiptItem=[{opNo:'ORPHAN',opDate:new Date(),amount:.8,taxAmount:.05,tax:6}];const view=screen();add(view,'ORPHAN');const before=JSON.stringify(mockDatabase.tables);await view.processPayment();
 expect(Alert.alert.mock.calls[0][0]).toContain('no receipt reference');expect(Alert.alert.mock.calls[0][0]).toContain('ask the office to review');expect(Alert.alert.mock.calls[0][2]).toBeUndefined();expect(JSON.stringify(mockDatabase.tables)).toBe(before);expect(Bluetooth.write).not.toHaveBeenCalled();
});
