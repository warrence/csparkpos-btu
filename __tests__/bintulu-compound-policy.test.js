import {paItems} from '../src/payments/paReceipts';
// Owner-confirmed Bintulu policy. Synthetic notices/printer/storage/network only.
import moment from 'moment';
import {Alert} from 'react-native';
import {memoryRealm} from '../test-support/memoryRealm';
import {calendarIsOverdue} from '../src/payments/calendarWindow';
let mockDatabase, mockPrint;
const mockObjects = type => {
  const rows = mockDatabase.objects(type);
  rows.sorted = () => rows;
  rows.filtered = query => {
    if (type === 'PaReceiptHeader') return rows;
    if (type === 'Offence') return rows.filter(row => row.city === 'Bintulu' && (!query.includes('AND code') || row.code === 'FIXTURE'));
    throw new Error('Unexpected fixture query');
  };
  return rows;
};
jest.mock('../src/realm', () => ({objects: (...a) => mockObjects(...a),
  write: callback => mockDatabase.write(callback),
  objectForPrimaryKey: (...a) => mockDatabase.objectForPrimaryKey(...a),
  create: (name, value) => mockDatabase.create(name, name.endsWith('ReceiptHeader') ? {...value,items:[]} : value),
}));
jest.mock('../src/printReceipt', () => jest.fn(() => ({print: (...a) => mockPrint(...a)})));
jest.mock('../src/global', () => ({SERVER_URL:'http://fixture.invalid'}));
jest.mock('axios', () => ({get:jest.fn(),post:jest.fn()}));
const Compound = require('../src/components/payments/CompoundPayment').default.wrappedComponent;
const {Toast} = require('native-base');
const oldDates = ['2001-01-01','2015-08-31',moment().subtract(61,'days').format('YYYY-MM-DD')];
function screen(allowOverduePa, issued) {
  mockDatabase.tables.City = [{code:'Bintulu',name:'Synthetic Bintulu',opExpiryDay:7,compoundExpiryDay:1,allowOverduePa}];
  mockDatabase.tables.Offence = [{city:'Bintulu',code:'FIXTURE',description:'Synthetic offence',amount:100,
    dayPay:14,dayPay2:7,disPercent:10,disPercent2:20}];
  const instance = new Compound();
  instance.props = {authStore:{userName:'FIXTURE'},generalStore:{Tax:6}};
  instance.setState = (change, done) => {Object.assign(instance.state,change);if(done)done();};
  instance.setState({paNo:'PAFIXTURE1',paDate:moment(issued,'YYYY-MM-DD').toDate(),carNo:'TESTCAR',
    offence:'FIXTURE',paAmount:100,amountReceived:''});
  return instance;
}
beforeEach(() => {
  mockDatabase=memoryRealm();mockPrint=jest.fn().mockResolvedValue(true);
  jest.spyOn(Alert,'alert').mockImplementation(()=>{});jest.spyOn(Toast,'show').mockImplementation(()=>{});
  jest.spyOn(console,'log').mockImplementation(()=>{});
});
afterEach(()=>jest.restoreAllMocks());
for (const allowOverduePa of [false,true]) {
  test.each(oldDates)(`Bintulu accepts old compound %s beyond city expiry with AllowOverduePa=${allowOverduePa}`,async issued=>{
    const instance=screen(allowOverduePa,issued);
    expect(calendarIsOverdue(issued,mockDatabase.tables.City[0].compoundExpiryDay)).toBe(true);
    instance.addItem();expect(instance.state.data).toHaveLength(1);expect(instance.state.total).toBe('100.00');
    expect(instance.state.data[0]).toMatchObject({price:100,taxAmount:0,disAmount:0,disPercent:0});
    await instance.processPayment();
    const receipts=mockDatabase.objects('PaReceiptHeader');expect(receipts).toHaveLength(1);
    expect(receipts[0]).toMatchObject({city:'Bintulu',carNo:'TESTCAR',paType:'C',userName:'FIXTURE'});
    expect(paItems(receipts[0])).toHaveLength(1);expect(paItems(receipts[0])[0]).toMatchObject({paNo:'PAFIXTURE1',amount:100,disAmount:0,taxAmount:0});
    expect(moment(paItems(receipts[0])[0].paDate).format('YYYY-MM-DD')).toBe(issued);
    expect(mockPrint).toHaveBeenCalledTimes(1);expect(mockPrint).toHaveBeenCalledWith('pa','PA-P1-71');
    expect(require('axios').get).not.toHaveBeenCalled();expect(require('axios').post).not.toHaveBeenCalled();
  });
  test(`Bintulu all-dates acceptance retains same-basket duplicate checks, flag=${allowOverduePa}`,()=>{
    const instance=screen(allowOverduePa,oldDates[0]);instance.addItem();
    instance.onPaNoChange('PAFIXTURE1');instance.addItem();expect(instance.state.data).toHaveLength(1);
    expect(Toast.show).toHaveBeenCalledWith(expect.objectContaining({text:'PA No. already exist!'}));
  });
  test(`Bintulu all-dates acceptance retains underpayment rejection, flag=${allowOverduePa}`,async()=>{
    const instance=screen(allowOverduePa,oldDates[0]);instance.addItem();instance.onAmountReceivedChange('99.99');
    await instance.processPayment();expect(mockDatabase.objects('PaReceiptHeader')).toHaveLength(0);
    expect(instance.state.data).toHaveLength(1);expect(mockPrint).not.toHaveBeenCalled();
    expect(Alert.alert).toHaveBeenCalledWith(expect.stringContaining('Payment was not saved:'));
  });
}
test.each([0,-1,NaN,Infinity])('Bintulu all-dates policy does not bypass invalid total %s',async total=>{
  const instance=screen(false,oldDates[0]);instance.addItem();instance.state.total=total;
  await instance.processPayment();expect(mockDatabase.objects('PaReceiptHeader')).toHaveLength(0);
  expect(mockPrint).not.toHaveBeenCalled();expect(instance.state.data).toHaveLength(1);
});
