// Call only inside a Realm write, after an exact upload ack or explicit cleanup confirmation.
export function removeLocalAdviceReceipt(database, record) {
  const receiptNo = record.receiptNo;
  const items = Array.from(record.items);
  const ownedIds = new Set(items.map(item => item.id));
  const orphan = Array.from(database.objects('AdviceReceiptItem')).some(item =>
    item.id.indexOf(receiptNo + '|') === 0 && !ownedIds.has(item.id));
  if (orphan) throw new Error('Advice has unlinked details; local receipts retained for investigation.');
  const shared = Array.from(database.objects('AdviceReceiptHeader')).some(other =>
    other.receiptNo !== record.receiptNo && Array.from(other.items).some(item => ownedIds.has(item.id)));
  if (shared) throw new Error('Advice details are shared; local receipts retained for investigation.');
  // Linked details are not cascade-deleted by Realm.
  database.delete(items);
  database.delete(record);
  if (database.objectForPrimaryKey('AdviceReceiptHeader', receiptNo) ||
      Array.from(database.objects('AdviceReceiptItem')).some(item => ownedIds.has(item.id)))
    throw new Error('Advice removal was incomplete; local transaction rolled back.');
}
