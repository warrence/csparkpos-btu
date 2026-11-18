import {assertNoRemovedNotice} from '../payments/receiptRemoval';
import {advicePayload} from './payload';
import {storedAdviceTotals, adviceReceiptLines} from './receipt';

const key=value=>String(value==null?'':value).trim().toUpperCase();
const identity=item=>JSON.stringify([key(item.city),key(item.noticeNo)]);
const rows=header=>Array.from(header.items||[]);
const date=value=>value!=null&&Number.isFinite(new Date(value).getTime());
const canonical=value=>{
  if(value instanceof Date)return value.toISOString();
  if(Array.isArray(value))return value.map(canonical);
  if(value&&typeof value==='object')return Object.keys(value).sort().reduce((out,k)=>{out[k]=canonical(value[k]);return out;},{});
  return value;
};
const equal=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
function review(message){throw new Error(`${message} Keep the existing records and ask the office to review. Do not collect again or change the notice number to bypass this check.`);}
function itemSnapshot(item){return {id:item.id,noticeNo:item.noticeNo,noticeDate:item.noticeDate,city:item.city,carNo:item.carNo,couponNo:item.couponNo,
  baseAmount:item.baseAmount,excessCharge:item.excessCharge,taxRate:item.taxRate,taxAmount:item.taxAmount,overdueFee:item.overdueFee};}
function snapshot(header){return JSON.stringify({receiptNo:header.receiptNo,receiptDate:header.receiptDate,userName:header.userName,pondokId:header.pondokId,
  city:header.city,carNo:header.carNo,reminderNo:header.reminderNo,overdue:header.overdue,amountReceived:header.amountReceived,totalAmount:header.totalAmount,
  rounding:header.rounding,status:header.status,postedAt:header.postedAt,postingPayload:header.postingPayload,rulesSnapshot:header.rulesSnapshot,items:rows(header).map(itemSnapshot)});}
function verify(database,header){
  const items=rows(header),profile=database.objects('GeneralProfile')[0],headers=Array.from(database.objects('AdviceReceiptHeader')),
    stored=Array.from(database.objects('AdviceReceiptItem'));
  if(!key(header.receiptNo)||!key(header.city)||!key(header.carNo)||!key(header.userName)||!key(header.pondokId)||!date(header.receiptDate)||
    typeof header.overdue!=='boolean'||!['pending','posted'].includes(header.status)||!items.length)
    review('The saved Advice receipt is incomplete or has an unrecognized local state.');
  if(!profile||key(profile.PondokId)!==key(header.pondokId))review(`Receipt ${header.receiptNo} has a different or unavailable pondok print profile.`);
  const seen=new Set(),ids=new Set();
  items.forEach(item=>{
    assertNoRemovedNotice(database,'an',item.city,item.noticeNo);
    const id=identity(item);
    if(!key(item.noticeNo)||key(item.city)!==key(header.city)||key(item.carNo)!==key(header.carNo)||!date(item.noticeDate)||
      typeof item.id!=='string'||!item.id.startsWith(header.receiptNo+'|')||!/^\d+$/.test(item.id.slice(header.receiptNo.length+1))||seen.has(id)||ids.has(item.id))
      review(`Receipt ${header.receiptNo} has incomplete or repeated Advice details.`);
    seen.add(id);ids.add(item.id);
    const matches=stored.filter(row=>identity(row)===id||row.id===item.id||(!key(row.city)&&key(row.noticeNo)===key(item.noticeNo)));
    if(matches.length!==1||matches[0].id!==item.id||!equal(itemSnapshot(matches[0]),itemSnapshot(item))||
      headers.filter(other=>rows(other).some(row=>row.id===item.id||identity(row)===id)).length!==1)
      review(`Receipt ${header.receiptNo} has ambiguous or shared Advice details.`);
    ['baseAmount','excessCharge','taxRate','taxAmount','overdueFee'].forEach(field=>{
      if(typeof item[field]!=='number'||!Number.isFinite(item[field])||item[field]<0)review(`Receipt ${header.receiptNo} has invalid saved amounts.`);
    });
  });
  if(stored.some(item=>String(item.id).startsWith(header.receiptNo+'|')&&!ids.has(item.id)))
    review(`Receipt ${header.receiptNo} has unlinked Advice details.`);
  try{
    const rules=JSON.parse(header.rulesSnapshot),payload=JSON.parse(header.postingPayload);
    if(!rules||typeof rules!=='object'||Array.isArray(rules)||![undefined,1,2,3].includes(rules.collectionPolicyVersion))throw Error('rules');
    if(typeof header.totalAmount!=='number'||!Number.isFinite(header.totalAmount)||header.totalAmount<=0||
      typeof header.rounding!=='number'||!Number.isFinite(header.rounding)||Math.abs(header.rounding*100-Math.round(header.rounding*100))>1e-7)throw Error('total');
    const totals=storedAdviceTotals(header);
    if(totals.base+totals.excess+totals.tax+totals.overdue+totals.rounding!==totals.total||!equal(payload,advicePayload(header)))throw Error('payload');
    // Exercise the existing stored-value renderer. Never apply today's collection policy.
    adviceReceiptLines(header);
  }catch(error){review(`Receipt ${header.receiptNo} has saved amounts or receipt data that cannot be verified for reprinting.`);}
}

// Read-only discovery runs before current collection validation so an old valid
// receipt can be found after rates/windows change. It runs again inside save's
// transaction; fresh collections still pass every existing financial check.
export function assertNewAdviceNotices(database,items){
  const selected=Array.from(items||[]),headers=Array.from(database.objects('AdviceReceiptHeader')),stored=Array.from(database.objects('AdviceReceiptItem')),
    matches=[],seen=new Set();
  selected.forEach(item=>{
    if(!key(item.city)||!key(item.noticeNo))return;
    assertNoRemovedNotice(database,'an',item.city,item.noticeNo);
    const id=identity(item);
    if(seen.has(id))throw new Error('This advice notice is already selected.');seen.add(id);
    const linked=headers.filter(header=>rows(header).some(row=>key(row.noticeNo)===key(item.noticeNo)&&
      (key(row.city)===key(item.city)||key(header.city)===key(item.city))));
    const existing=stored.filter(row=>identity(row)===id||(!key(row.city)&&key(row.noticeNo)===key(item.noticeNo)));
    if(!linked.length&&!existing.length)return;
    if(linked.length!==1)review(linked.length?`Advice notice ${item.noticeNo} links to multiple saved receipts.`:`Advice notice ${item.noticeNo} has a local item but no verified receipt reference.`);
    verify(database,linked[0]);matches.push({notice:item.noticeNo,receipt:linked[0]});
  });
  if(!matches.length)return;
  const numbers=Array.from(new Set(matches.map(match=>match.receipt.receiptNo)));
  if(numbers.length!==1)review(`The selected Advice notices belong to different saved receipts: ${numbers.join(', ')}.`);
  const receipt=matches[0].receipt,receiptNo=receipt.receiptNo,original=snapshot(receipt);
  const error=new Error(`Advice notice${matches.length===1?'':'s'} ${matches.map(match=>match.notice).join(', ')} already has a local receipt: ${receiptNo} (vehicle ${receipt.carNo}). No new receipt or payment was saved; other selected notices are unchanged.`);
  error.receiptNo=receiptNo;error.printKind='an';
  error.validateReprint=()=>{
    const current=database.objectForPrimaryKey('AdviceReceiptHeader',receiptNo);
    if(!current||snapshot(current)!==original)review(`Receipt ${receiptNo} is no longer available unchanged on this device.`);
    verify(database,current);
  };
  throw error;
}
