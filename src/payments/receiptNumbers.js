import {highestReceiptCounter} from '../advice/counters';

// Call only inside the same Realm transaction that inserts the NEW receipt.
// Existing collected receipts and immutable upload payloads are never renumbered.
export function nextReceiptNumber(database, profile, overdue) {
  if (!profile || !profile.PondokId) throw new Error('Load valid pondok numbering settings.');
  const counter = overdue ? 'PaReceiptNo' : 'OpReceiptNo';
  const prefix = overdue ? profile.PaReceiptPrefix : profile.OpReceiptPrefix;
  if (!prefix) throw new Error('Load valid receipt numbering settings.');
  const next = highestReceiptCounter(database, profile, overdue) + 1;
  if (!Number.isSafeInteger(next)) throw new Error('Receipt counter exceeds the supported range.');
  const receiptNo = `${prefix}-${profile.PondokId}-${next}`;
  if (receiptNo.length > 20) throw new Error('Receipt number exceeds the office limit. Check pondok numbering.');
  const type = overdue ? 'PaReceiptHeader' : 'OpReceiptHeader';
  if (database.objectForPrimaryKey(type, receiptNo) || database.objectForPrimaryKey('AdviceReceiptHeader', receiptNo))
    throw new Error('Receipt number already exists. No new collection was saved.');
  return {receiptNo, counter, next};
}
