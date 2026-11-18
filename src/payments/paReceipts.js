import {assertNoRemovedNotice} from './receiptRemoval';
// Legacy notice-keyed objects are retained verbatim. New lines have a receipt-
// scoped technical key; business duplicate checks remain separate and durable.
export const paKind = type => ['C','R'].includes(type) ? 'compound' : ['O','RO'].includes(type) ? 'op' : null;
export const paItems = receipt => Array.from(receipt.lines && receipt.lines.length ? receipt.lines : receipt.items || []);
const key = value => String(value == null ? '' : value).trim().toUpperCase();
function duplicate(message, receipt) {
  const error = new Error(message);
  if (receipt) {error.receiptNo=receipt.receiptNo;error.printKind=paKind(receipt.paType)==='op'?'oc':'pa';}
  throw error;
}
export function assertNewPaNotices(database, header, items) {
  const kind=paKind(header.paType), city=key(header.city), seen=new Set();
  if (!kind || !city || !items.length) throw new Error('Enter a valid city and payment notices.');
  const headers=Array.from(database.objects('PaReceiptHeader'));
  const linkedLegacy=new Set();headers.forEach(row=>Array.from(row.items||[]).forEach(item=>linkedLegacy.add(key(item.paNo))));
  items.forEach(item=>{
    assertNoRemovedNotice(database,kind,city,item.paNo);
    const notice=key(item.paNo);if(!notice)throw new Error('Enter a valid notice number.');
    if(seen.has(notice))throw new Error(`Notice ${notice} is already in this receipt.`);seen.add(notice);
    headers.forEach(row=>{
      const contains=paItems(row).some(saved=>key(saved.paNo)===notice);
      if(contains && (!key(row.city)||!paKind(row.paType)))
        duplicate(`Earlier receipt ${row.receiptNo} contains notice ${notice}, but its city/type is incomplete. Check the existing receipt and office record before collecting again.`);
      if(key(row.city)===city && paKind(row.paType)===kind && paItems(row).some(saved=>key(saved.paNo)===notice))
        duplicate(`Notice ${notice} was already collected on receipt ${row.receiptNo}. Use Reprint Receipt; do not collect it again.`,row);
    });
    const orphan=Array.from(database.objects('PaReceiptItem')).some(saved=>key(saved.paNo)===notice&&!linkedLegacy.has(key(saved.paNo)));
    const orphanLine=Array.from(database.objects('PaReceiptLine')).some(saved=>key(saved.paNo)===notice&&key(saved.city)===city&&saved.noticeKind===kind&&!headers.some(row=>row.receiptNo===saved.receiptNo&&paItems(row).some(line=>line.id===saved.id)));
    if(orphan||orphanLine)duplicate(`An earlier local record for notice ${notice} has no receipt reference. It may already have been uploaded. Check the office record before collecting again; do not delete or change the notice number.`);
  });
}
export function savePaReceipt(database, header, items) {
  assertNewPaNotices(database,header,items);
  const receipt=database.create('PaReceiptHeader',{...header,items:[],lines:[],status:'pending'});
  items.forEach((item,index)=>receipt.lines.push(database.create('PaReceiptLine',{
    paNo:item.paNo,paDate:item.paDate,offence:item.offence,amount:item.amount,
    taxAmount:item.taxAmount,tax:item.tax,disAmount:item.disAmount,disPercent:item.disPercent,
    id:JSON.stringify([header.receiptNo,index]),receiptNo:header.receiptNo,
    city:header.city,noticeKind:paKind(header.paType),opAmount:Number(item.opAmount||0)
  })));
  return receipt;
}
export function paReceiptPayload(row) {
  return {receiptNo:row.receiptNo,userName:row.userName,receiptDate:row.receiptDate,pondokId:row.pondokId,
    city:row.city,carNo:row.carNo,paType:row.paType,reminderNo:row.reminderNo,
    items:paItems(row).map(item=>({paNo:item.paNo,paDate:item.paDate,offence:item.offence,
      amount:item.amount,taxAmount:item.taxAmount,tax:item.tax,disAmount:item.disAmount,
      disPercent:item.disPercent,opAmount:item.opAmount}))};
}
export const paUploadState = row => row.status || 'pending';
export function markPaUploading(database, rows) {
  database.write(()=>rows.forEach(row=>{
    if(paUploadState(row)!=='pending')throw new Error('Receipt upload state changed. Review it before retrying.');
    row.uploadPayload=JSON.stringify(paReceiptPayload(row));row.status='uploading';
  }));
}
export function markPaUploadResult(database, rows, accepted) {
  database.write(()=>rows.forEach(row=>{row.status=accepted?'uploaded':'uncertain';if(accepted)row.uploadedAt=new Date();}));
}
export const paUploadLabel = row => ({'legacy-review':'Existing receipt — verify prior upload with office',pending:'Pending upload',uploaded:'Previously marked uploaded - verify with Office',uploading:'Upload outcome unknown — check office',uncertain:'Upload outcome unknown — check office'}[paUploadState(row)]||'Unknown upload state — check office');
export function latestPaReceipt(database, kind) {
  return Array.from(database.objects('PaReceiptHeader')).filter(row=>paKind(row.paType)===kind)
    .sort((a,b)=>new Date(b.receiptDate)-new Date(a.receiptDate)||b.receiptNo.localeCompare(a.receiptNo))[0];
}
