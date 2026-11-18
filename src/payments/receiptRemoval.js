// Local recoverable removal only. No Office cancellation, refund or counter reset.
const definitions = {
  op: {header:'OpReceiptHeader', children:[['items','OpReceiptItem','opNo']]},
  pa: {header:'PaReceiptHeader', children:[['items','PaReceiptItem','paNo'],['lines','PaReceiptLine','id']]},
  an: {header:'AdviceReceiptHeader', children:[['items','AdviceReceiptItem','id']]},
  coupon: {header:'CouponReceiptHeader', children:[['items','CouponReceiptItem','startingCouponNo']]},
  mbill: {header:'MBillReceiptHeader', children:[['items','MBillReceiptItem','mBillNo']]},
};
const plain = value => JSON.parse(JSON.stringify(value));
const key = value => String(value == null ? '' : value).trim().toUpperCase();
const archiveId = (kind,receiptNo) => JSON.stringify([kind,receiptNo]);
function definition(kind) {if(!definitions[kind])throw Error('Unknown receipt type.');return definitions[kind];}
function snapshot(row, spec) {
  // Realm JSON contains all schema fields; lists are materialized explicitly.
  const data=plain(row);
  spec.children.forEach(([list])=>{data[list]=Array.from(row[list]||[]).map(plain);});
  return data;
}
function attemptKey(receiptNo){return archiveId('an',receiptNo);}
export function markAdviceUploadAttempt(database, receipts) {
  database.write(()=>receipts.forEach(receipt=>{
    const active=database.objectForPrimaryKey('AdviceReceiptHeader',receipt.receiptNo);
    if(!active||active.status!=='pending'||active.postingPayload!==JSON.stringify(receipt))throw Error('Advice upload source changed.');
    database.create('ReceiptUploadAttempt',{id:attemptKey(receipt.receiptNo),receiptNo:receipt.receiptNo,createdAt:new Date()},true);
  }));
}
export function clearAdviceUploadAttempt(database, receiptNo) {
  const row=database.objectForPrimaryKey('ReceiptUploadAttempt',attemptKey(receiptNo));if(row)database.delete(row);
}
function ensureNoUnresolvedUpload(database) {
  if(database.objects('LegacyPostingOutbox').length)
    throw Error('A saved upload is unresolved. Keep all receipts and reconcile/retry it before removing or restoring records.');
}
function verify(database, kind, row, confirmedUpload=false) {
  if(!confirmedUpload)ensureNoUnresolvedUpload(database);
  if(!confirmedUpload && kind==='pa' && !['pending','uploaded'].includes(row.status||'legacy-review'))
    throw Error('This PA upload has an unknown outcome. Ask Office to reconcile it; it cannot be removed.');
  if(!confirmedUpload && kind==='an' && (database.objectForPrimaryKey('ReceiptUploadAttempt',attemptKey(row.receiptNo)) || !['pending','posted'].includes(row.status)))
    throw Error('This AN upload may already have reached Office. Reconcile it before removing it.');
  const spec=definition(kind),headers=Array.from(database.objects(spec.header));
  spec.children.forEach(([list,table,id])=>{
    const linked=Array.from(row[list]||[]),ids=new Set();
    linked.forEach(item=>{
      if(!item[id]||ids.has(item[id]))throw Error('Receipt has missing or duplicate details. Nothing was removed.');ids.add(item[id]);
      const stored=Array.from(database.objects(table)).filter(x=>x[id]===item[id]);
      if(stored.length!==1||JSON.stringify(plain(stored[0]))!==JSON.stringify(plain(item)))throw Error('Receipt detail cannot be verified. Nothing was removed.');
      if(headers.some(other=>other.receiptNo!==row.receiptNo&&Array.from(other[list]||[]).some(x=>x[id]===item[id])))throw Error('Receipt details are shared. Office review is required.');
    });
    if(['AdviceReceiptItem','PaReceiptLine'].includes(table)&&Array.from(database.objects(table)).some(item=>
      (table==='PaReceiptLine'?item.receiptNo===row.receiptNo:String(item.id).startsWith(row.receiptNo+'|'))&&!ids.has(item[id])))
      throw Error('Receipt has unlinked details. Office review is required.');
  });
}
export function receiptRemovalRows(database, group) {
  let rows=[];
  Object.keys(definitions).forEach(kind=>{
    Array.from(database.objects(definitions[kind].header)).forEach(row=>{
      const inGroup=group==='all'||group===kind||(group==='op'&&kind==='an'&&!row.overdue)||(group==='pa'&&kind==='an'&&row.overdue);
      if(inGroup)rows.push({kind,receiptNo:row.receiptNo});
    });
  });
  return rows.sort((a,b)=>archiveId(a.kind,a.receiptNo).localeCompare(archiveId(b.kind,b.receiptNo)));
}
export function planReceiptRemoval(database, descriptors) {
  if(!descriptors.length)throw Error('There are no receipts to remove.');
  const seen=new Set();
  const receipts=descriptors.map(({kind,receiptNo})=>{
    const spec=definition(kind),id=archiveId(kind,receiptNo),row=database.objectForPrimaryKey(spec.header,receiptNo);
    if(seen.has(id)||!row)throw Error('Receipt selection changed. Review it again.');seen.add(id);
    if(database.objectForPrimaryKey('ReceiptRemovalArchive',id))throw Error('This receipt already has removal evidence. Office review is required.');
    verify(database,kind,row);
    return {kind,receiptNo,payload:JSON.stringify(snapshot(row,spec)),status:row.status||'pending/legacy',
      itemCount:spec.children.reduce((sum,[list])=>sum+Array.from(row[list]||[]).length,0)};
  });
  return {receipts};
}
export function removeReviewedReceipts(database, plan, actor) {
  if(!actor||!plan||!plan.receipts||!plan.receipts.length)throw Error('Review and confirm the selected receipts first.');
  database.write(()=>{
    const fresh=planReceiptRemoval(database,plan.receipts);
    if(JSON.stringify(fresh)!==JSON.stringify(plan))throw Error('Receipts changed after review. Nothing was removed. Review again.');
    fresh.receipts.forEach(item=>{
      const spec=definition(item.kind),row=database.objectForPrimaryKey(spec.header,item.receiptNo);
      archiveAndRemove(database,item.kind,row,item.payload,actor);
    });
  });
  return plan.receipts.length;
}
export function assertNoRemovedNotice(database, kind, city, notice) {
  Array.from(database.objects('ReceiptRemovalArchive')).forEach(record=>{
    let row;try{row=JSON.parse(record.payload);}catch(error){throw Error('Removed receipt evidence cannot be read. Ask Office to review before collecting.');}
    const matchingKind=record.kind===kind||(record.kind==='pa'&&['compound','op'].includes(kind)&&!['C','R','O','RO'].includes(row.paType))||(record.kind==='pa'&&kind==='op'&&['O','RO'].includes(row.paType))||
      (record.kind==='pa'&&kind==='compound'&&['C','R'].includes(row.paType));
    if(!matchingKind)return;
    const items=row.lines&&row.lines.length?row.lines:row.items||[];
    if((!key(city)||!key(row.city)||key(city)===key(row.city))&&items.some(item=>key(item.noticeNo||item.opNo||item.paNo)===key(notice)))
      throw Error(`Notice ${notice} belongs to locally removed receipt ${record.receiptNo}. Restore it from Maintenance or ask Office to reconcile it; do not collect again.`);
  });
}
function revive(data) {
  const dates=['receiptDate','uploadedAt','postedAt','opDate','paDate','noticeDate'];
  if(Array.isArray(data))return data.map(revive);
  if(data&&typeof data==='object')return Object.keys(data).reduce((out,name)=>{
    out[name]=dates.includes(name)&&data[name]!=null?new Date(data[name]):revive(data[name]);return out;
  },{});
  return data;
}
export function planReceiptRestore(database,id) {
  ensureNoUnresolvedUpload(database);
  const record=database.objectForPrimaryKey('ReceiptRemovalArchive',id);if(!record)throw Error('Removed receipt is no longer available.');
  if(record.removedBy==='office-upload-confirmed')throw Error('This receipt was uploaded to Office. Its history is retained, but it cannot be restored to the upload queue. Ask Office for a reprint.');
  const spec=definition(record.kind);let row;try{row=JSON.parse(record.payload);}catch(e){throw Error('Removal evidence is unreadable.');}
  if(row.receiptNo!==record.receiptNo||database.objectForPrimaryKey(spec.header,record.receiptNo))throw Error('An active receipt already exists or archive identity is invalid. Nothing restored.');
  spec.children.forEach(([list,table,idField])=>(row[list]||[]).forEach(item=>{
    if(Array.from(database.objects(table)).some(x=>x[idField]===item[idField]))throw Error('A notice/detail already exists locally. Do not overwrite it; ask Office to reconcile.');
  }));
  return {id,kind:record.kind,receiptNo:record.receiptNo,payload:record.payload};
}
export function restoreReviewedReceipt(database,plan) {
  database.write(()=>{
    if(JSON.stringify(planReceiptRestore(database,plan.id))!==JSON.stringify(plan))throw Error('Removal evidence changed. Review again.');
    const spec=definition(plan.kind),data=revive(JSON.parse(plan.payload)),children={};
    spec.children.forEach(([list,table])=>{children[list]=(data[list]||[]).map(item=>database.create(table,item));delete data[list];});
    const row=database.create(spec.header,{...data,...Object.keys(children).reduce((o,k)=>{o[k]=[];return o;},{})});
    spec.children.forEach(([list])=>children[list].forEach(item=>row[list].push(item)));
    database.delete(database.objectForPrimaryKey('ReceiptRemovalArchive',plan.id));
    if(database.objectForPrimaryKey('ReceiptRemovalArchive',plan.id))throw Error('Restore incomplete; changes rolled back.');
  });
}

export function nextOtherReceiptCounter(database,profile,kind) {
  const label=kind==='coupon'?'Coupon':'MBill',prefix=`${profile[label+'ReceiptPrefix']}-${profile.PondokId}-`;
  let highest=Number(profile[label+'ReceiptNo']);if(!Number.isSafeInteger(highest)||highest<0)throw Error('Invalid receipt numbering settings.');
  [definition(kind).header,'ReceiptRemovalArchive'].forEach(table=>Array.from(database.objects(table)).forEach(row=>{
    if(String(row.receiptNo).startsWith(prefix)){const n=String(row.receiptNo).slice(prefix.length);if(/^\d+$/.test(n)&&Number.isSafeInteger(Number(n)))highest=Math.max(highest,Number(n));}
  }));
  if(!Number.isSafeInteger(highest+1))throw Error('Receipt number limit reached.');return highest+1;
}
function couponRange(item) {
  const a=key(item.startingCouponNo).match(/^(.*?)(\d+)$/),b=key(item.endingCouponNo).match(/^(.*?)(\d+)$/);
  if(!a||!b||a[1]!==b[1])return null;return {prefix:a[1],start:Number(a[2]),end:Number(b[2])};
}
export function assertNoRemovedSale(database,kind,city,items) {
  Array.from(database.objects('ReceiptRemovalArchive')).filter(row=>row.kind===kind).forEach(record=>{
    let saved;try{saved=JSON.parse(record.payload);}catch(e){throw Error('Removed receipt evidence is unreadable.');}
    const matches=items.some(item=>(saved.items||[]).some(old=>{
      if(kind==='mbill')return key(item.mBillNo)===key(old.mBillNo)&&(!key(city)||!key(saved.city)||key(city)===key(saved.city));
      const a=couponRange(item),b=couponRange(old);
      return key(item.startingCouponNo)===key(old.startingCouponNo)||!a||!b||(a.prefix===b.prefix&&a.start<=b.end&&b.start<=a.end);
    }));
    if(matches)throw Error(`This item belongs to locally removed receipt ${record.receiptNo}. Restore or reconcile it; do not collect again.`);
  });
}

function archiveAndRemove(database,kind,row,payload,actor) {
  const spec=definition(kind),receiptNo=row.receiptNo;
      database.create('ReceiptRemovalArchive',{id:archiveId(kind,receiptNo),kind:kind,receiptNo:receiptNo,
        payload:payload,removedAt:new Date(),removedBy:actor});
      spec.children.forEach(([list])=>database.delete(Array.from(row[list]||[])));
      database.delete(row);
      if(database.objectForPrimaryKey(spec.header,receiptNo))throw Error('Receipt removal incomplete; changes rolled back.');
      const original=JSON.parse(payload);
      spec.children.forEach(([list,table,keyField])=>{
        if(Array.from(database.objects(table)).some(saved=>(original[list]||[]).some(child=>child[keyField]===saved[keyField])))
          throw Error('Receipt detail removal incomplete; changes rolled back.');
      });
}

// Must be called INSIDE the caller's ack transaction, after exact source/payload verification.
// Archives are retained for evidence, never restored to active upload queues.
export function archiveConfirmedUpload(database,kind,row) {
  verify(database,kind,row,true);
  const id=archiveId(kind,row.receiptNo);
  if(database.objectForPrimaryKey('ReceiptRemovalArchive',id))throw Error('Upload archive identity conflict. Retain receipts for review.');
  archiveAndRemove(database,kind,row,JSON.stringify(snapshot(row,definition(kind))),'office-upload-confirmed');
}
export function cleanupPreviouslyUploaded(database) {
  const result={removed:0,held:0};
  // An unresolved batch may refer to any family. Do not infer success from its presence.
  if(database.objects('LegacyPostingOutbox').length)return result;
  const candidates=receiptRemovalRows(database,'all').filter(({kind,receiptNo})=>{
    const row=database.objectForPrimaryKey(definition(kind).header,receiptNo);
    // Old PA clients set uploaded after a bare HTTP200; timestamp/payload is not proof.
    if(kind==='pa'&&row.status==='uploaded'){result.held+=1;return false;}
    return kind==='an'&&row.status==='posted';
  });
  candidates.forEach(({kind,receiptNo})=>{
    try{database.write(()=>{
      const row=database.objectForPrimaryKey(definition(kind).header,receiptNo);
      if(!row||kind!=='an'||row.status!=='posted')throw Error('Upload status changed.');
      const time=row.postedAt;
      const payload=JSON.parse(row.postingPayload);
      if(!time||!Number.isFinite(Number(time))||!payload||payload.receiptNo!==receiptNo)throw Error('Upload metadata incomplete.');
      verify(database,kind,row);
      archiveConfirmedUpload(database,kind,row);
    });result.removed+=1;}catch(error){result.held+=1;}
  });
  return result;
}
