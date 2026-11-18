import {markAdviceUploadAttempt, clearAdviceUploadAttempt, archiveConfirmedUpload} from '../payments/receiptRemoval';
import moment from 'moment';
import {cents, money} from './collection';
import {adviceReminder} from './reminder';
import {readAdviceRules} from './rules';

export function advicePayload(receipt) {
  const items = Array.from(receipt.items);
  const reminder=adviceReminder(receipt.reminderNo);
  const rules = receipt.rulesSnapshot ? JSON.parse(receipt.rulesSnapshot) : {};
  return {
    ...([2,3].includes(rules.collectionPolicyVersion) ? {collectionPolicyVersion: rules.collectionPolicyVersion, feeBasis: rules.feeBasis} : {}),
    ...(reminder?{reminderNo:reminder}:{}),
    receiptNo: receipt.receiptNo,
    receiptDate: new Date(receipt.receiptDate).toISOString(),
    userName: receipt.userName, pondokId: receipt.pondokId,
    city: receipt.city, carNo: receipt.carNo, overdue: receipt.overdue,
    totalAmount: money(cents(receipt.totalAmount)), roundingAmount: Number(receipt.rounding).toFixed(2),
    items: items.map(item => ({
      opNo: item.noticeNo, opDate: moment(item.noticeDate).format('YYYY-MM-DD'),
      couponNo: item.couponNo,
      baseAmount: money(cents(item.baseAmount)), excessCharges: money(cents(item.excessCharge)),
      taxAmount: money(cents(item.taxAmount)), taxPercent: Number(item.taxRate).toFixed(2),
      compoundAmount: money(cents(item.overdueFee)),
    })),
  };
}

export function acknowledgedAdvice(response, sent) {
  if (!response || response.protocolVersion !== 1 || !Array.isArray(response.receipts)) return [];
  const known = new Set(sent.map(item => item.receiptNo));
  return sent.filter(item => {
    const rows = response.receipts.filter(row => row && row.receiptNo === item.receiptNo);
    return known.has(item.receiptNo) && rows.length === 1 &&
      ['accepted', 'already_received'].includes(rows[0].status) && rows[0].staged === true &&
      Array.isArray(rows[0].errors) && rows[0].errors.length === 0 &&
      (!item.reminderNo || rows[0].reminderNo === item.reminderNo);
  }).map(item => item.receiptNo);
}

export async function postAdviceBatch(realm, http, server, dateStart, dateEnd, includeCounts=false) {
  const countFields=(notices=0,alreadyReceivedNotices=0,confirmedReceipts=0)=>includeCounts?{notices,alreadyReceivedNotices,confirmedReceipts}:{};
  const records = Array.from(realm.objects('AdviceReceiptHeader').filtered(
    'receiptDate >= $0 AND receiptDate < $1 AND status == $2', dateStart, dateEnd, 'pending'));
  if (!records.length) return {sent:0,retained:0,...countFields()};
  // JSON captured at collection is immutable across retries and rate refreshes.
  const payload = [];
  let blockedLegacy = 0;
  let reminderSupported=false;
  try {reminderSupported=readAdviceRules(realm).rules.reminderNoSupported===true;} catch(error){/* Hold populated reminders until supported. */}
  records.forEach(record => {
    try {
      const saved = JSON.parse(record.postingPayload);
      if (saved && saved.receiptNo === record.receiptNo) {
        // Prelaunch policy changed. Old collections need explicit owner resolution,
        // never repricing, renumbering, uploading or deletion under a new policy.
        if (saved.collectionPolicyVersion !== 3) {blockedLegacy += 1;return;}
        if (!saved.reminderNo || reminderSupported) payload.push(saved);
      }
    } catch (error) { /* Retain corrupt/unreadable entries for investigation. */ }
  });
  if (!payload.length) return {sent:0,retained:records.length,...countFields(),...(blockedLegacy ? {blockedLegacy} : {})};
  // Protect the entire snapshotted run before the first network await, including later batches.
  try {markAdviceUploadAttempt(realm,payload);} catch(error) {return {sent:0,retained:records.length,...countFields()};}
  let sent=0,notices=0,alreadyReceivedNotices=0,confirmedReceipts=0;
  for (let offset = 0; offset < payload.length; offset += 100) {
    const batch = payload.slice(offset, offset + 100);
    try {
      const response = await http.post(`${server}/api/pondok-advice-posting`, {protocolVersion: 1, adviceReceipts: batch}, {timeout: 30000});
      const acknowledged = acknowledgedAdvice(response.data, batch);
      // Report verified office acceptance even if local cleanup later fails.
      // `sent` below remains the existing locally removed receipt count.
      batch.filter(saved=>acknowledged.includes(saved.receiptNo)).forEach(saved=>{
        const itemCount=Array.isArray(saved.items)?saved.items.length:0;
        notices+=itemCount;confirmedReceipts+=1;
        if(response.data.receipts.find(row=>row && row.receiptNo===saved.receiptNo).status==='already_received')alreadyReceivedNotices+=itemCount;
      });
      let updated=0;
      realm.write(() => {
        batch.forEach(saved => {
          if (!acknowledged.includes(saved.receiptNo)) return;
          // Resolve afresh: earlier batches may have invalidated Realm objects.
          const record = realm.objectForPrimaryKey('AdviceReceiptHeader', saved.receiptNo);
          if (record && record.status === 'pending' && record.postingPayload === JSON.stringify(saved)) {
            // Children and header/outbox payload disappear in one transaction.
            record.status='posted';record.postedAt=new Date();
            archiveConfirmedUpload(realm,'an',record);
            clearAdviceUploadAttempt(realm, saved.receiptNo);
            updated += 1;
          }
        });
      });
      sent+=updated;
    } catch (error) {
      // Every unacknowledged receipt stays pending, including lost responses.
    }
  }
  return {sent,retained:records.length-sent,...countFields(notices,alreadyReceivedNotices,confirmedReceipts),...(blockedLegacy ? {blockedLegacy} : {})};
}
