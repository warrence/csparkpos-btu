import {assertNoRemovedNotice} from './receiptRemoval';
// Normal OP still has legacy notice-keyed items. Never upsert/delete a collision
// or infer payment/posting status. Only offer an actually linked saved receipt.
const key=value=>String(value==null?'':value).trim().toUpperCase();
const rows=receipt=>Array.from(receipt.items||[]);
const validDate=value=>value!=null && Number.isFinite(new Date(value).getTime());
const finite=value=>typeof value==='number' && Number.isFinite(value);
function review(message) {
  throw new Error(`${message} Keep the existing records and ask the office to review. Do not collect again or change the notice number to bypass this check.`);
}
function snapshot(receipt) {
  return JSON.stringify({receiptNo:receipt.receiptNo,userName:receipt.userName,receiptDate:receipt.receiptDate,
    pondokId:receipt.pondokId,city:receipt.city,carNo:receipt.carNo,taxPolicyVersion:receipt.taxPolicyVersion,
    items:rows(receipt).map(item=>({opNo:item.opNo,opDate:item.opDate,amount:item.amount,taxAmount:item.taxAmount,tax:item.tax,carNo:item.carNo}))});
}
function printable(receipt) {
  const items=rows(receipt),seen=new Set();
  return key(receipt.receiptNo) && key(receipt.city) && key(receipt.userName) && key(receipt.pondokId) && validDate(receipt.receiptDate) &&
    items.length && items.every(item=>{
      const notice=key(item.opNo);
    if(!notice||seen.has(notice))return false;seen.add(notice);
      return validDate(item.opDate)&&finite(item.amount)&&finite(item.taxAmount)&&finite(item.tax);
    });
}
function verifyReceiptLinks(database,receipt) {
  const headers=Array.from(database.objects('OpReceiptHeader')),items=Array.from(database.objects('OpReceiptItem'));
  rows(receipt).forEach(saved=>{
    const notice=key(saved.opNo);
    if(headers.filter(header=>rows(header).some(item=>key(item.opNo)===notice)).length!==1 ||
      items.some(item=>key(item.opNo)===notice && item.opNo!==saved.opNo))
      review(`Saved receipt ${receipt.receiptNo} has ambiguous or conflicting notice links.`);
  });
}
function verifyPrintProfile(database,receipt) {
  const profile=database.objects('GeneralProfile')[0];
  if(!profile||key(profile.PondokId)!==key(receipt.pondokId))review(`Receipt ${receipt.receiptNo} belongs to a different or unavailable pondok print profile.`);
  // Older OP printing uses the profile tax. Only permit it when it agrees with
  // every recorded rate; never reinterpret old receipts as policy3 or reprice.
  if(receipt.taxPolicyVersion!==3 && (![null,undefined,1,2].includes(receipt.taxPolicyVersion) ||
    !finite(profile.Tax) || rows(receipt).some(item=>item.tax!==profile.Tax)))
    review(`Receipt ${receipt.receiptNo} has historical tax settings that cannot be verified for reprinting.`);
}
export function assertNewOpNotices(database,city,items) {
  const notices=Array.from(items),seen=new Set(),headers=Array.from(database.objects('OpReceiptHeader'));
  const storedItems=Array.from(database.objects('OpReceiptItem')),matches=[];
  notices.forEach(item=>{
    const notice=key(item.opNo);
    assertNoRemovedNotice(database,'op',city,notice);
    if(!notice)throw new Error('Enter a valid OP notice number.');
    if(seen.has(notice))throw new Error(`Notice ${notice} appears more than once in this receipt. Remove the duplicate; no new receipt was saved.`);
    seen.add(notice);
    const linked=headers.filter(header=>rows(header).some(saved=>key(saved.opNo)===notice));
    const existing=storedItems.filter(saved=>key(saved.opNo)===notice);
    if(!linked.length && !existing.length)return;
    if(linked.length!==1)review(linked.length ? `Notice ${notice} links to more than one local receipt.` : `An earlier local item for notice ${notice} has no receipt reference; it may have been uploaded.`);
    const receipt=linked[0];
    if(!key(city)||!key(receipt.city)||key(city)!==key(receipt.city))review(`Notice ${notice} conflicts with an existing receipt whose city is different or incomplete.`);
    // A second case/spacing variant can be a separate legacy primary key. Do not
    // choose one row and silently ignore the other unlinked/ambiguous record.
    const saved=rows(receipt).filter(row=>key(row.opNo)===notice);
    if(saved.length!==1 || existing.some(row=>row.opNo!==saved[0].opNo))review(`Notice ${notice} has conflicting local item references.`);
    if(!printable(receipt))review(`Saved receipt ${receipt.receiptNo||'(unknown)'} is incomplete and cannot be verified for reprinting.`);
    matches.push({notice,receipt});
  });
  if(!matches.length)return;
  const receiptNos=Array.from(new Set(matches.map(match=>match.receipt.receiptNo)));
  if(receiptNos.length!==1)review(`The selected notices belong to different saved receipts: ${receiptNos.join(', ')}. No new receipt was saved.`);
  const receipt=matches[0].receipt,receiptNo=receipt.receiptNo,original=snapshot(receipt);
  verifyReceiptLinks(database,receipt);
  verifyPrintProfile(database,receipt);
  const error=new Error(`Notice${matches.length>1?'s':''} ${matches.map(match=>match.notice).join(', ')} already link${matches.length===1?'s':''} to saved receipt ${receiptNo}. No new receipt was saved; the other selected notices are unchanged.`);
  error.receiptNo=receiptNo;error.printKind='op';
  error.validateReprint=()=>{
    const current=database.objectForPrimaryKey('OpReceiptHeader',receiptNo);
    if(!current||!printable(current)||snapshot(current)!==original)review(`Receipt ${receiptNo} is no longer available unchanged on this device.`);
    verifyPrintProfile(database,current);
    verifyReceiptLinks(database,current);
  };
  throw error;
}
