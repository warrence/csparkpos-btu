// OP and PA are shared by ordinary and advice receipts. Refreshing office data
// must never lower either series beneath receipts already issued on this tablet.
export function highestReceiptCounter(database, profile, overdue) {
  const counter = overdue ? 'PaReceiptNo' : 'OpReceiptNo';
  const prefixKey = overdue ? 'PaReceiptPrefix' : 'OpReceiptPrefix';
  const prefix = profile[prefixKey];
  const start = `${prefix}-${profile.PondokId}-`;
  let highest = Number(profile[counter] || 0);
  if (!Number.isSafeInteger(highest) || highest < 0) throw new Error('Load valid receipt numbering settings.');
  Array.from(database.objects('GeneralProfile')).forEach(saved => {
    if (saved.PondokId === profile.PondokId && saved[prefixKey] === prefix) highest = Math.max(highest, saved[counter]);
  });
  [overdue ? 'PaReceiptHeader' : 'OpReceiptHeader', 'AdviceReceiptHeader', 'ReceiptRemovalArchive', ...(overdue ? ['PaReceiptLine'] : [])].forEach(type => {
    Array.from(database.objects(type)).forEach(record => {
      if (record.receiptNo.startsWith(start)) {
        const suffix = record.receiptNo.slice(start.length);
        if (/^\d+$/.test(suffix) && Number.isSafeInteger(Number(suffix))) highest = Math.max(highest, Number(suffix));
      }
    });
  });
  return highest;
}

export function preserveReceiptCounters(database, profile) {
  return {...profile,
    OpReceiptNo: highestReceiptCounter(database, profile, false),
    PaReceiptNo: highestReceiptCounter(database, profile, true)};
}
