import {POSTING_PROTOCOL} from '../src/payments/safePosting';
// Entire transport is mocked. The captured body is synthetic cross-side contract evidence.
import fs from 'fs';
import Posting from '../src/components/posting';
import axios from 'axios';
import {memoryRealm,materializeReceiptLinks} from '../test-support/memoryRealm';
let mockDatabase;
jest.mock('../src/realm', () => ({objects: name => mockDatabase.objects(name), write: callback => mockDatabase.write(callback),
  objectForPrimaryKey:(...args)=>mockDatabase.objectForPrimaryKey(...args), delete:rows=>mockDatabase.delete(rows),create:(...args)=>mockDatabase.create(...args)}));
jest.mock('../src/global', () => ({SERVER_URL:'https://fixture.invalid'}));
jest.mock('../src/printClosing', () => jest.fn());
jest.mock('../src/printReceipt', () => jest.fn());
jest.mock('mobx-react', () => ({inject:()=>target=>target, observer:target=>target}));
jest.mock('bugsnag-react-native', () => ({Client:jest.fn(()=>({notify:jest.fn()}))}));
jest.mock('axios', () => ({post:jest.fn(),get:jest.fn()}));
const item=(no,carNo)=>({opNo:no,opDate:new Date('2026-10-05T04:00:00Z'),amount:.8,taxAmount:.05,tax:6,carNo});
const header=(no,carNo,items)=>({receiptNo:no,userName:'FIXTURE',receiptDate:new Date('2026-10-06T04:00:00Z'),
  pondokId:'FIXTURE-P1',city:'BTU',taxPolicyVersion:3,carNo,items});
function view(){materializeReceiptLinks(mockDatabase);const p=new Posting({});p.setState=v=>Object.assign(p.state,v);p.state={...p.state,date_to_load:'06/10/2026'};return p;}
beforeEach(()=>{
  mockDatabase=memoryRealm();axios.post.mockReset();jest.spyOn(console,'log').mockImplementation(()=>{});
  mockDatabase.tables.OpReceiptHeader=[
    header('SYNTHETIC-SHARED','SHAREDCAR',[item('SHARED-ONE','SHAREDCAR'),item('SHARED-TWO','SHAREDCAR')]),
    header('SYNTHETIC-MIXED',null,[item('MIXED-ONE','FIRSTCAR'),item('MIXED-TWO','SECONDCAR'),item('MIXED-UNKNOWN',null)]),
    header('SYNTHETIC-LEGACY',undefined,[item('LEGACY-UNKNOWN',undefined)])
  ];
});
afterEach(()=>jest.restoreAllMocks());

test('actual Daily Posting sends saved per-notice vehicles and keeps unknowns absent from the wire',async()=>{
  axios.post.mockImplementation((url,body)=>Promise.resolve(safeResponse(body)));
  await view().onLoadButtonPress();
  expect(axios.post).toHaveBeenCalledTimes(1);
  expect(axios.post.mock.calls[0][0]).toBe('https://fixture.invalid/api/pondok-posting');
  const wire=JSON.parse(JSON.stringify(axios.post.mock.calls[0][1]));
  expect(wire.opReceipts).toHaveLength(3);
  const [shared,mixed,legacy]=wire.opReceipts;
  expect(shared.carNo).toBe('SHAREDCAR');expect(shared.items.map(i=>i.carNo)).toEqual(['SHAREDCAR','SHAREDCAR']);
  expect(mixed).not.toHaveProperty('carNo');expect(mixed.items.map(i=>i.carNo)).toEqual(['FIRSTCAR','SECONDCAR',undefined]);
  expect(legacy).not.toHaveProperty('carNo');expect(legacy.items[0]).not.toHaveProperty('carNo');
  wire.opReceipts.forEach(r=>{expect(r).not.toHaveProperty('taxPolicyVersion');r.items.forEach(i=>{
    expect(i.amount).toBe(.8);expect(i.taxAmount).toBe(.05);expect(i.tax).toBe(6);
  });});
  if(process.env.CSPARKPOS_OPN_WIRE_FIXTURE_PATH)fs.writeFileSync(process.env.CSPARKPOS_OPN_WIRE_FIXTURE_PATH,JSON.stringify(wire,null,2)+'\n');
  expect(mockDatabase.objects('OpReceiptHeader')).toHaveLength(0); // existing successful-upload policy
});

test('transport failure retains all saved normal OPN vehicle metadata for existing retry flow',async()=>{
  axios.post.mockRejectedValue(new Error('SYNTHETIC network unavailable'));
  const before=JSON.stringify(mockDatabase.tables.OpReceiptHeader);
  await view().onLoadButtonPress();
  expect(axios.post).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(mockDatabase.tables.OpReceiptHeader)).toBe(before);
});

function safeResponse(body){return {data:{protocol:POSTING_PROTOCOL,requestId:body.requestId,complete:true,accepted:[...body.opReceipts.map(r=>({kind:'op',receiptNo:r.receiptNo,itemCount:r.items.length,status:'accepted'})),...body.paReceipts.map(r=>({kind:'pa',receiptNo:r.receiptNo,itemCount:r.items.length,status:'accepted'})),...body.couponReceipts.map(r=>({kind:'coupon',receiptNo:r.receiptNo,itemCount:r.items.length,status:'accepted'}))]}};}
beforeEach(()=>{axios.get.mockResolvedValue({data:{protocol:POSTING_PROTOCOL,ready:true}});});
