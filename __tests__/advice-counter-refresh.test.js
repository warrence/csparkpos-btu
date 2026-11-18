import {preserveReceiptCounters} from '../src/advice/counters';
import LoadGeneralProfile from '../src/components/load-data/LoadGeneralProfile';
import axios from 'axios';
import {memoryRealm} from '../test-support/memoryRealm';
let mockDatabase;
jest.mock('../src/realm', () => ({
  objects: name => mockDatabase.objects(name),
  write: callback => mockDatabase.write(callback),
  delete: rows => {mockDatabase.tables.GeneralProfile = mockDatabase.tables.GeneralProfile.filter(row => !rows.includes(row));},
  create: (name, row) => mockDatabase.create(name, row),
}));
jest.mock('../src/global', () => ({SERVER_URL: 'https://fixture.invalid'}));
jest.mock('bugsnag-react-native', () => ({Client: jest.fn(() => ({notify: jest.fn()}))}));
jest.mock('axios', () => ({get: jest.fn()}));

test('profile refresh keeps shared high-water counters for ordinary OP/PA after AN, including posted archives', async () => {
  mockDatabase = memoryRealm();
  mockDatabase.tables.AdviceReceiptHeader = [{receiptNo: 'OP-P1-45', status: 'posted'}, {receiptNo: 'PA-P1-76', status: 'pending'}];
  mockDatabase.tables.OpReceiptHeader = [{receiptNo: 'OP-P1-46'}];
  axios.get.mockImplementation(url => Promise.resolve({data: url.endsWith('/company') ? {} : url.includes('/receipt-no/') ?
    {op_receipt_prefix: 'OP', pa_receipt_prefix: 'PA', op_receipt_no: 1, pa_receipt_no: 1} : {PondokID: 'P1'}}));
  expect(await LoadGeneralProfile({state: {pondok_to_load: 'P1'}})).toBe(true);
  const profile = mockDatabase.objects('GeneralProfile')[0];
  expect(profile.OpReceiptNo + 1).toBe(47);expect(profile.PaReceiptNo + 1).toBe(77);
  expect(mockDatabase.tables.AdviceReceiptHeader).toEqual([{receiptNo: 'OP-P1-45', status: 'posted'}, {receiptNo: 'PA-P1-76', status: 'pending'}]);
});

test('refresh preserves issued counters even after ordinary headers were posted/deleted; separate pondoks and prefixes do not collide', () => {
  const db = memoryRealm();
  const original = db.objects('GeneralProfile')[0];
  expect(preserveReceiptCounters(db, {...original, OpReceiptNo: 1, PaReceiptNo: 1})).toMatchObject({OpReceiptNo: 40, PaReceiptNo: 70});
  expect(preserveReceiptCounters(db, {...original, PondokId: 'P2', OpReceiptNo: 1, PaReceiptNo: 1})).toMatchObject({OpReceiptNo: 1, PaReceiptNo: 1});
  expect(preserveReceiptCounters(db, {...original, OpReceiptPrefix: 'NEW', OpReceiptNo: 1})).toMatchObject({OpReceiptNo: 1, PaReceiptNo: 70});
});
