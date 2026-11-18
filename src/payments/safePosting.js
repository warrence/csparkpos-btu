import {archiveConfirmedUpload,cleanupPreviouslyUploaded} from './receiptRemoval';
// Durable transport outbox only. This does not collect or settle a payment.
import {legacyOpReceiptPayload} from './legacyPosting';
import {paReceiptPayload, paUploadState} from './paReceipts';

export const POSTING_PROTOCOL = 'pondok-receipts-v1';
const OUTBOX_ID = 'pending';
const groups = {opReceipts:'OpReceiptHeader', paReceipts:'PaReceiptHeader', couponReceipts:'CouponReceiptHeader'};
const kinds = {opReceipts:'op',paReceipts:'pa',couponReceipts:'coupon'};
const json = value => JSON.stringify(value);
const plain = value => JSON.parse(json(value));
function couponPayload(row) {
  return {receiptNo:row.receiptNo,userName:row.userName,receiptDate:row.receiptDate,pondokId:row.pondokId,
    items:Array.from(row.items).map(item=>({startingCouponNo:item.startingCouponNo,endingCouponNo:item.endingCouponNo,
      couponType:item.couponType,taxAmount:item.taxAmount,amount:item.amount,tax:item.tax}))};
}
const payloadFor = {opReceipts:legacyOpReceiptPayload,paReceipts:paReceiptPayload,couponReceipts:couponPayload};
function receiptKeys(body) {
  return Object.keys(groups).reduce((all,group)=>all.concat(body[group].map(row=>json([kinds[group],row.receiptNo]))),[]).sort();
}
export function completePostingAcknowledgment(response, body) {
  if (!response || response.protocol!==POSTING_PROTOCOL || response.requestId!==body.requestId ||
    response.complete!==true || !Array.isArray(response.accepted)) return false;
  const expected=receiptKeys(body);
  if (response.accepted.some(row=>!row || !['accepted','already_received'].includes(row.status) || !Number.isInteger(row.itemCount))) return false;
  const actual=response.accepted.map(row=>json([row.kind,row.receiptNo])).sort();
  if (Object.keys(groups).some(group=>body[group].some(saved=>!response.accepted.some(row=>row.kind===kinds[group] && row.receiptNo===saved.receiptNo && row.itemCount===saved.items.length)))) return false;
  return new Set(expected).size===expected.length && json(actual)===json(expected);
}
function selected(database, name, start, end) {
  return Array.from(database.objects(name).filtered('receiptDate >= $0 && receiptDate < $1',start,end));
}
function loadOutbox(database) {
  const record=database.objectForPrimaryKey('LegacyPostingOutbox',OUTBOX_ID);
  if (!record) return null;
  let body;
  try {body=JSON.parse(record.payload);} catch(error){throw new Error('Saved upload is unreadable. Keep the app data and ask the office to review it.');}
  if (!body || body.postingProtocol!==POSTING_PROTOCOL || body.requestId!==record.requestId ||
    Object.keys(groups).some(group=>!Array.isArray(body[group])) || !receiptKeys(body).length)
    throw new Error('Saved upload is incomplete. Keep the app data and ask the office to review it.');
  return {record,body};
}
function verifySource(database,body) {
  // Never delete or mark an edited/new receipt because an older snapshot was acknowledged.
  Object.keys(groups).forEach(group=>body[group].forEach(saved=>{
    const row=database.objectForPrimaryKey(groups[group],saved.receiptNo);
    if (!row || json(plain(payloadFor[group](row)))!==json(saved))
      throw new Error(`Receipt ${saved.receiptNo} changed after upload was prepared. Kept for office review; do not recollect.`);
    if (group==='paReceipts' && (!['pending','uploading','uncertain'].includes(paUploadState(row)) ||
      (row.uploadPayload && row.uploadPayload!==json(saved))))
      throw new Error(`PA receipt ${saved.receiptNo} has a conflicting upload history. Keep it for office review.`);
  }));
}
function prepare(database,start,end,dateKey) {
  const existing=loadOutbox(database);
  if (existing) {
    if (existing.record.dateKey!==dateKey) throw new Error(`Retry the saved upload for ${existing.record.dateKey} first. Other receipts are unchanged.`);
    verifySource(database,existing.body);
    return existing;
  }
  const selectedPa=selected(database,'PaReceiptHeader',start,end);
  if (selectedPa.some(row=>!['pending','uploaded'].includes(paUploadState(row))))
    throw new Error('An earlier PA upload has an unknown outcome without a safe retry record. Ask the office to reconcile it; do not recollect.');
  if (selected(database,'MBillReceiptHeader',start,end).length)
    throw new Error('Miscellaneous bill upload is not supported by this office endpoint. All selected receipts are kept for review.');
  const body={postingProtocol:POSTING_PROTOCOL,
    requestId:`pos-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`,
    opReceipts:selected(database,'OpReceiptHeader',start,end).map(legacyOpReceiptPayload),
    paReceipts:selectedPa.filter(row=>paUploadState(row)==='pending').map(paReceiptPayload),
    couponReceipts:selected(database,'CouponReceiptHeader',start,end).map(couponPayload),mBillReceipts:[]};
  if (!receiptKeys(body).length) return null;
  // Snapshot and PA marker are committed before any network write. A crash leaves an exact retry.
  const payload=json(body);
  let record;
  database.write(()=>{
    record=database.create('LegacyPostingOutbox',{id:OUTBOX_ID,dateKey,requestId:body.requestId,payload,createdAt:new Date()});
    body.paReceipts.forEach(saved=>{
      const row=database.objectForPrimaryKey('PaReceiptHeader',saved.receiptNo);
      row.uploadPayload=json(saved);row.status='uploading';
    });
  });
  return {record,body:JSON.parse(payload)};
}
export function legacyNoticeCounts(body, response) {
  const counts={op:0,pa:0,couponReceipts:0,alreadyReceived:0,receipts:receiptKeys(body).length};
  Object.keys(groups).forEach(group=>body[group].forEach(saved=>{
    const ack=response.accepted.find(row=>row.kind===kinds[group] && row.receiptNo===saved.receiptNo);
    if (group==='couponReceipts') {counts.couponReceipts+=1;return;}
    const kind=group==='opReceipts'||['O','RO'].includes(saved.paType)?'op':'pa';
    counts[kind]+=saved.items.length;
    if(ack.status==='already_received')counts.alreadyReceived+=saved.items.length;
  }));
  return counts;
}
export async function postLegacyBatch(database,http,server,start,end,dateKey) {
  // Capability gate is read-only: new app never sends a blind batch to an old server.
  cleanupPreviouslyUploaded(database);
  const pending=prepare(database,start,end,dateKey);
  if (!pending) return {sent:0,pending:false};
  const {record,body}=pending;
  let confirmed;
  try {
    const capability=await http.get(`${server}/api/pondok-posting-capabilities`,{timeout:30000});
    if (!capability || !capability.data || capability.data.protocol!==POSTING_PROTOCOL || capability.data.ready!==true)
      throw new Error('Office safe-upload update is required.');
    const response=await http.post(`${server}/api/pondok-posting`,body,{timeout:30000});
    if (!completePostingAcknowledgment(response.data,body))
      throw new Error('Office did not confirm the complete saved upload.');
    confirmed=legacyNoticeCounts(body,response.data);
    database.write(()=>{
      const current=database.objectForPrimaryKey('LegacyPostingOutbox',OUTBOX_ID);
      if (!current || current.payload!==json(body) || current.requestId!==body.requestId)
        throw new Error('The saved upload changed. Keep all receipts for office review.');
      verifySource(database,body);
      Object.keys(groups).forEach(group=>body[group].forEach(saved=>{
        const row=database.objectForPrimaryKey(groups[group],saved.receiptNo);
        if (group==='paReceipts') {row.status='uploaded';row.uploadedAt=new Date();}
        archiveConfirmedUpload(database,kinds[group],row);
      }));
      database.delete(current);
    });
    return {sent:receiptKeys(body).length,pending:false,counts:confirmed};
  } catch(error) {
    // Includes timeout after commit, malformed 200 and local cleanup failure. Exact outbox survives.
    if (confirmed) return {sent:0,pending:true,counts:confirmed,message:'Office confirmed this upload, but local cleanup needs review. Keep all app data; do not recollect. '+error.message};
    const conflict=error.response && error.response.status>=400 && error.response.status<500;
    return {sent:0,pending:true,message:conflict ?
      'Office could not confirm this batch. Saved upload retained for office reconciliation; do not recollect or clear app data.' :
      'Upload not confirmed. Saved receipts retained. Retry the same posting date after the office safe-upload service is available.'};
  }
}
