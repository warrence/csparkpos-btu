// Read-only display union; current AN receipts remain in their original archive.
export function opMaintenanceRows(database) {
  const rows = Array.from(database.objects('OpReceiptHeader')).map(row => ({
    rowKey: `op:${row.receiptNo}`, source: 'OPN', receiptNo: row.receiptNo,
    pondokId: row.pondokId, userName: row.userName, receiptDate: row.receiptDate,
    city: row.city, status: '', items: Array.from(row.items).map(item => ({opNo: item.opNo}))
  }));
  Array.from(database.objects('AdviceReceiptHeader')).filter(row => row.overdue === false).forEach(row => rows.push({
    rowKey: `an:${row.receiptNo}`, source: 'AN current', receiptNo: row.receiptNo,
    pondokId: row.pondokId, userName: row.userName, receiptDate: row.receiptDate,
    city: row.city, status: row.status === 'posted' ? 'Uploaded (not settlement)' : row.status,
    items: Array.from(row.items).map(item => ({opNo: item.noticeNo}))
  }));
  return rows.sort((a,b) => new Date(b.receiptDate)-new Date(a.receiptDate) || a.rowKey.localeCompare(b.rowKey));
}
