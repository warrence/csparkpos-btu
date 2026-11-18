// Received is an optional cash-tender entry, never the amount being collected.
// Empty means unspecified, not zero/exact cash. Work in cents for change due.
export function paymentTender(value, total) {
  const due = Math.round(Number(total) * 100);
  if (!Number.isSafeInteger(due) || due <= 0) throw new Error('Enter a valid payment total.');
  if (value == null || String(value).trim() === '') return {received: null, change: null};
  const text = String(value).trim(), units = Math.round(Number(text) * 100);
  if (!/^\d+(\.\d{1,2})?$/.test(text) || !Number.isSafeInteger(units))
    throw new Error('Amount received must be a non-negative amount with at most two decimal places.');
  if (units < due) throw new Error('Amount received is less than the receipt total.');
  return {received: units / 100, change: (units - due) / 100};
}

export const paymentChangeMessage = change => change == null ? '' : `Change: RM ${change.toFixed(2)}`;
export const paymentSavedMessage = (receiptNo, change) =>
  `Saved ${receiptNo}.${change == null ? '' : ` ${paymentChangeMessage(change)}.`}`;
