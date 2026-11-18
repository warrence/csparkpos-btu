import {POSTING_PROTOCOL} from '../src/payments/safePosting';
import Closing from '../src/components/posting';
import axios from 'axios';
import {Alert} from 'react-native';
import {memoryRealm,materializeReceiptLinks} from '../test-support/memoryRealm';
let mockDatabase;
jest.mock('../src/realm', () => ({objects: name => mockDatabase.objects(name), write: callback => mockDatabase.write(callback), objectForPrimaryKey:(...args)=>mockDatabase.objectForPrimaryKey(...args), delete:rows=>mockDatabase.delete(rows),create:(...args)=>mockDatabase.create(...args)}));
jest.mock('../src/global', () => ({SERVER_URL: 'https://fixture.invalid'}));
jest.mock('../src/printClosing', () => jest.fn());
jest.mock('../src/printReceipt', () => jest.fn());
jest.mock('mobx-react', () => ({inject: () => target => target, observer: target => target}));
jest.mock('bugsnag-react-native', () => ({Client: jest.fn(() => ({notify: jest.fn()}))}));
jest.mock('axios', () => ({post:jest.fn(),get:jest.fn()}));

function screen() {
  materializeReceiptLinks(mockDatabase);
  const view = new Closing({});
  view.setState = update => Object.assign(view.state, update);
  view.state = {...view.state, date_to_load: '17/10/2026'};
  return view;
}

test('rapid posting taps send one request and unlock after completion', async () => {
  mockDatabase = memoryRealm();let finish;
  mockDatabase.tables.AdviceReceiptHeader = [{receiptNo: 'OP-P1-1', status: 'pending', receiptDate: new Date(2026, 9, 17, 12),
    items:[], postingPayload: JSON.stringify({collectionPolicyVersion:3,receiptNo: 'OP-P1-1'})}];
  axios.post.mockImplementation(() => new Promise(resolve => {finish = resolve;}));
  const log = jest.spyOn(console, 'log').mockImplementation(() => {});
  const view = screen();const first = view.onLoadButtonPress();await view.onLoadButtonPress();
  expect(axios.post).toHaveBeenCalledTimes(1);
  finish({data: {protocolVersion: 1, receipts: [{receiptNo: 'OP-P1-1', status: 'accepted', staged: true, errors: []}]}});
  await first;
  expect(view._posting).toBe(false);expect(view.state.isLoading).toBe(false);
  await view.onLoadButtonPress();expect(axios.post).toHaveBeenCalledTimes(1);
  log.mockRestore();
});

test('invalid posting date makes no request and keeps receipts', async () => {
  mockDatabase = memoryRealm();axios.post.mockClear();const view = screen();view.state.date_to_load = '31/02/2026';
  const alert = jest.spyOn(Alert, 'alert');
  await view.onLoadButtonPress();expect(axios.post).not.toHaveBeenCalled();
  expect(alert).toHaveBeenCalledWith('Choose a valid posting date.');alert.mockRestore();
});

test('old pending Advice is held with an actionable owner-review message', async () => {
  mockDatabase=memoryRealm();axios.post.mockClear();
  const original=JSON.stringify({collectionPolicyVersion:2,receiptNo:'OLD-AN'});
  mockDatabase.tables.AdviceReceiptHeader=[{receiptNo:'OLD-AN',status:'pending',receiptDate:new Date(2026,9,17,12),items:[],postingPayload:original}];
  const alert=jest.spyOn(Alert,'alert');const log=jest.spyOn(console,'log').mockImplementation(()=>{});
  await screen().onLoadButtonPress();
  expect(axios.post).not.toHaveBeenCalled();
  expect(mockDatabase.tables.AdviceReceiptHeader[0].postingPayload).toBe(original);
  expect(alert).toHaveBeenCalledWith('Daily Posting',expect.stringContaining('1 Advice receipts use the old calculation. Kept unchanged for owner review; do not recollect or delete them.'));
  alert.mockRestore();log.mockRestore();
});

test('PA success retains reprintable history, sends only legacy fields, and never posts it twice',async()=>{
 mockDatabase=memoryRealm();axios.post.mockClear();axios.post.mockImplementation((url,body)=>Promise.resolve(safeResponse(body)));
 const {savePaReceipt}=require('../src/payments/paReceipts');let saved;mockDatabase.write(()=>{saved=savePaReceipt(mockDatabase,{receiptNo:'PA-P1-71',userName:'FIXTURE',receiptDate:new Date(2026,9,17,12),pondokId:'P1',city:'Bintulu',carNo:'TEST',paType:'C',reminderNo:''},[{paNo:'TEST1',paDate:new Date(2026,9,17),offence:'ARTICLE 8(1)',amount:15,taxAmount:0,tax:0,disAmount:3,disPercent:20,opAmount:0}]);});
 const log=jest.spyOn(console,'log').mockImplementation(()=>{});await screen().onLoadButtonPress();expect(axios.post).toHaveBeenCalledTimes(1);const payload=axios.post.mock.calls[0][1].paReceipts[0];expect(payload.items[0].amount-payload.items[0].disAmount).toBe(12);expect(payload.items[0]).not.toHaveProperty('id');expect(payload).not.toHaveProperty('lines');expect(payload).not.toHaveProperty('status');expect(saved.status).toBe('uploaded');expect(mockDatabase.objects('PaReceiptHeader')).toHaveLength(0);expect(mockDatabase.objects('PaReceiptLine')).toHaveLength(0);expect(mockDatabase.objects('ReceiptRemovalArchive')).toHaveLength(1);await screen().onLoadButtonPress();expect(axios.post).toHaveBeenCalledTimes(1);log.mockRestore();
});
test.each(['uncertain','uploading'])('PA %s outcome blocks blind retries of the shared legacy batch after restart',async state=>{
 mockDatabase=memoryRealm();axios.post.mockClear();mockDatabase.tables.PaReceiptHeader=[{receiptNo:'PA-OLD',receiptDate:new Date(2026,9,17,12),status:state,items:[]}];mockDatabase.tables.OpReceiptHeader=[{receiptNo:'OP-PENDING',receiptDate:new Date(2026,9,17,12),items:[]}];
 ['CouponReceiptHeader','MBillReceiptHeader','AdviceReceiptHeader','LegacyPostingOutbox'].forEach(name=>mockDatabase.objects(name));materializeReceiptLinks(mockDatabase);const before=JSON.stringify(mockDatabase.tables);const log=jest.spyOn(console,'log').mockImplementation(()=>{});await screen().onLoadButtonPress();expect(axios.post).not.toHaveBeenCalled();expect(JSON.stringify(mockDatabase.tables)).toBe(before);log.mockRestore();
});
test('new-protocol PA failure retains immutable outbox and safely retries exact snapshot',async()=>{
 mockDatabase=memoryRealm();axios.post.mockClear();axios.post.mockRejectedValue(new Error('synthetic timeout after possible server acceptance'));const receipt={receiptNo:'PA-OLD',receiptDate:new Date(2026,9,17,12),paType:'C',status:'pending',items:[{paNo:'TEST1',amount:15,disAmount:3,taxAmount:0,opAmount:0}]};mockDatabase.tables.PaReceiptHeader=[receipt];const log=jest.spyOn(console,'log').mockImplementation(()=>{});await screen().onLoadButtonPress();expect(receipt.status).toBe('uploading');expect(mockDatabase.objects('PaReceiptHeader')).toHaveLength(1);expect(receipt.items[0].amount).toBe(15);const first=JSON.stringify(axios.post.mock.calls[0][1]);await screen().onLoadButtonPress();expect(axios.post).toHaveBeenCalledTimes(2);expect(JSON.stringify(axios.post.mock.calls[1][1])).toBe(first);log.mockRestore();
});
test('existing v28 unposted PA retains ordinary daily posting behaviour',async()=>{
 mockDatabase=memoryRealm();axios.post.mockClear();axios.post.mockImplementation((url,body)=>Promise.resolve(safeResponse(body)));mockDatabase.tables.PaReceiptHeader=[{receiptNo:'PA-LEGACY',receiptDate:new Date(2026,9,17,12),paType:'C',items:[]}];const log=jest.spyOn(console,'log').mockImplementation(()=>{});await screen().onLoadButtonPress();expect(axios.post).toHaveBeenCalledTimes(1);expect(mockDatabase.tables.PaReceiptHeader).toHaveLength(0);expect(JSON.parse(mockDatabase.tables.ReceiptRemovalArchive[0].payload).status).toBe('uploaded');log.mockRestore();
});
test('synchronous upload interruption retains durable outbox and allows protected exact retry',async()=>{
 mockDatabase=memoryRealm();axios.post.mockClear();axios.post.mockImplementation(()=>{throw Error('synthetic interrupted upload');});mockDatabase.tables.PaReceiptHeader=[{receiptNo:'PA-INTERRUPTED',receiptDate:new Date(2026,9,17,12),status:'pending',items:[]}];const view=screen(),log=jest.spyOn(console,'log').mockImplementation(()=>{});await view.onLoadButtonPress();expect(view._posting).toBe(false);expect(view.state.isLoading).toBe(false);expect(mockDatabase.tables.PaReceiptHeader[0].status).toBe('uploading');await screen().onLoadButtonPress();expect(axios.post).toHaveBeenCalledTimes(2);expect(axios.post.mock.calls[1][1]).toEqual(axios.post.mock.calls[0][1]);log.mockRestore();
});

function safeResponse(body){return {data:{protocol:POSTING_PROTOCOL,requestId:body.requestId,complete:true,accepted:[...body.opReceipts.map(r=>({kind:'op',receiptNo:r.receiptNo,itemCount:r.items.length,status:'accepted'})),...body.paReceipts.map(r=>({kind:'pa',receiptNo:r.receiptNo,itemCount:r.items.length,status:'accepted'})),...body.couponReceipts.map(r=>({kind:'coupon',receiptNo:r.receiptNo,itemCount:r.items.length,status:'accepted'}))]}};}
beforeEach(()=>{axios.get.mockResolvedValue({data:{protocol:POSTING_PROTOCOL,ready:true}});});

test('daily summary counts OP/overdue OP/AN/PA notices, not headers or coupons, and distinguishes recovered retries',async()=>{
 mockDatabase=memoryRealm();axios.post.mockClear();
 const date=new Date(2026,9,17,12),base={receiptDate:date,userName:'FIXTURE',pondokId:'P1',city:'BTU'};
 mockDatabase.tables.OpReceiptHeader=[{...base,receiptNo:'OP-CNT',items:[{opNo:'OP1',amount:1,tax:0,taxAmount:0},{opNo:'OP2',amount:1,tax:0,taxAmount:0}]}];
 mockDatabase.tables.PaReceiptHeader=[{...base,receiptNo:'PA-CNT',paType:'C',carNo:'TEST',items:[{paNo:'PA1',amount:15,tax:0,taxAmount:0}]},{...base,receiptNo:'OVERDUE-CNT',paType:'O',carNo:'TEST',items:[{paNo:'OLDOP1',amount:15,tax:0,taxAmount:0}]}];
 mockDatabase.tables.CouponReceiptHeader=[{...base,receiptNo:'CP-CNT',items:[{startingCouponNo:'A1',endingCouponNo:'A10',couponType:'40',amount:4,tax:0,taxAmount:0}]}];
 const an={collectionPolicyVersion:3,receiptNo:'AN-CNT',items:[{opNo:'AN1'},{opNo:'AN2'},{opNo:'AN3'}]};mockDatabase.tables.AdviceReceiptHeader=[{...base,receiptNo:'AN-CNT',status:'pending',postingPayload:JSON.stringify(an),items:[]}];
 axios.post.mockImplementation((url,body)=>{if(url.includes('advice'))return Promise.resolve({data:{protocolVersion:1,receipts:[{receiptNo:'AN-CNT',status:'already_received',staged:true,errors:[]}]}});const r=safeResponse(body);r.data.accepted.find(row=>row.receiptNo==='OP-CNT').status='already_received';return Promise.resolve(r);});
 const alert=jest.spyOn(Alert,'alert');await screen().onLoadButtonPress();
 expect(alert).toHaveBeenCalledWith('Daily Posting',expect.stringContaining('Notices confirmed: 7 (OP 3, AN 3, PA 1).'));
 expect(alert).toHaveBeenCalledWith('Daily Posting',expect.stringContaining('Previously received on an earlier attempt: 5; newly received: 2.'));
 expect(alert).toHaveBeenCalledWith('Daily Posting',expect.stringContaining('Receipts confirmed: 5. Coupon receipts: 1 (not notices).'));
 alert.mockClear();await screen().onLoadButtonPress();expect(alert).toHaveBeenCalledWith('Daily Posting',expect.stringContaining('Notices confirmed: 0'));expect(axios.post).toHaveBeenCalledTimes(2);alert.mockRestore();
});

test('successful AN count is still reported when historical PA holds the separate legacy batch',async()=>{
 mockDatabase=memoryRealm();axios.post.mockClear();const receiptDate=new Date(2026,9,17,12);
 mockDatabase.tables.PaReceiptHeader=[{receiptNo:'PA-HELD',receiptDate,status:'uncertain',items:[]}];
 mockDatabase.tables.AdviceReceiptHeader=[{receiptNo:'AN-OK',receiptDate,status:'pending',items:[],postingPayload:JSON.stringify({collectionPolicyVersion:3,receiptNo:'AN-OK',items:[{opNo:'A1'},{opNo:'A2'}]})}];
 axios.post.mockResolvedValue({data:{protocolVersion:1,receipts:[{receiptNo:'AN-OK',status:'accepted',staged:true,errors:[]}]}});
 const alert=jest.spyOn(Alert,'alert');await screen().onLoadButtonPress();expect(alert).toHaveBeenCalledWith('Daily Posting',expect.stringContaining('Notices confirmed: 2 (OP 0, AN 2, PA 0).'));expect(alert).toHaveBeenCalledWith('Daily Posting',expect.stringContaining('unknown outcome'));expect(axios.post).toHaveBeenCalledTimes(1);alert.mockRestore();
});
