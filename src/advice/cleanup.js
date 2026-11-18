import {removeLocalAdviceReceipt} from './localRemoval';

function fingerprint(record) {
  return JSON.stringify({receiptNo: record.receiptNo, receiptDate: Number(record.receiptDate),
    postedAt: Number(record.postedAt), status: record.status, overdue: record.overdue,
    userName: record.userName, pondokId: record.pondokId, city: record.city, carNo: record.carNo,
    reminderNo: record.reminderNo, totalAmount: record.totalAmount, rounding: record.rounding,
    amountReceived: record.amountReceived, postingPayload: record.postingPayload, rulesSnapshot: record.rulesSnapshot,
    items: Array.from(record.items).map(item => ({id:item.id,noticeNo:item.noticeNo,
      noticeDate:Number(item.noticeDate),city:item.city,carNo:item.carNo,couponNo:item.couponNo,
      baseAmount:item.baseAmount,excessCharge:item.excessCharge,taxRate:item.taxRate,
      taxAmount:item.taxAmount,overdueFee:item.overdueFee}))});
}

// Review-only in-memory manifest. Nothing runs at startup/migration or after install.
export function planUploadedAdviceCleanup(database) {
  const receipts = Array.from(database.objects('AdviceReceiptHeader')).filter(row => row.status === 'posted')
    .sort((a,b) => a.receiptNo.localeCompare(b.receiptNo)).map(row => {
      const payload = JSON.parse(row.postingPayload);
      if (!payload || payload.receiptNo !== row.receiptNo || !row.postedAt || !Number.isFinite(Number(row.postedAt)))
        throw new Error('Uploaded receipt metadata is incomplete. No cleanup was performed.');
      return {receiptNo:row.receiptNo,overdue:row.overdue,itemCount:row.items.length,fingerprint:fingerprint(row)};
    });
  return {receipts};
}

// Only the explicit, user-visible confirmation callback may invoke this.
export function removeConfirmedUploadedAdvice(database, reviewed) {
  if (!reviewed || !Array.isArray(reviewed.receipts) || !reviewed.receipts.length)
    throw new Error('Review uploaded AN receipts before confirming removal.');
  let removed = 0;
  database.write(() => {
    const fresh = planUploadedAdviceCleanup(database);
    if (JSON.stringify(fresh) !== JSON.stringify(reviewed))
      throw new Error('Uploaded AN receipts changed. Review the list and confirm again. Nothing was removed.');
    fresh.receipts.forEach(item => {
      const record = database.objectForPrimaryKey('AdviceReceiptHeader', item.receiptNo);
      removeLocalAdviceReceipt(database, record);removed += 1;
    });
  });
  return removed;
}
