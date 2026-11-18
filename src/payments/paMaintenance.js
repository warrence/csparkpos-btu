import {paItems, paUploadLabel} from './paReceipts';
// Display descriptors only: AN archives stay in their original Realm model.
export function paMaintenanceRows(database) {
  const rows = Array.from(database.objects('PaReceiptHeader')).map(row => ({
    rowKey: `pa:${row.receiptNo}`, source: 'PA', receiptNo: row.receiptNo,
    pondokId: row.pondokId, userName: row.userName, receiptDate: row.receiptDate,
    paType: row.paType, status: paUploadLabel(row), items: paItems(row).map(item => ({paNo: item.paNo}))
  }));
  Array.from(database.objects('AdviceReceiptHeader')).filter(row => row.overdue).forEach(row => rows.push({
    rowKey: `an:${row.receiptNo}`, source: 'AN', receiptNo: row.receiptNo,
    pondokId: row.pondokId, userName: row.userName, receiptDate: row.receiptDate,
    paType: 'AN overdue', status: row.status === 'posted' ? 'Uploaded (not settlement)' : row.status,
    items: Array.from(row.items).map(item => ({paNo: item.noticeNo}))
  }));
  return rows.sort((a,b) => new Date(b.receiptDate)-new Date(a.receiptDate) || a.rowKey.localeCompare(b.rowKey));
}
