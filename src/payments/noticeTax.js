// Round base-only tax to cents for a NEW notice before summing the basket.
// Cash rounding remains a separate receipt-level operation.
export function noticeTaxCents(baseCents, taxPercent) {
  const text = String(taxPercent == null ? '' : taxPercent).trim();
  if (!Number.isSafeInteger(baseCents) || baseCents < 0 || !/^\d+(\.\d{1,2})?$/.test(text))
    throw new Error('Load valid notice amounts and tax percent before collecting.');
  const percentUnits = Math.round(Number(text) * 100);
  const product = baseCents * percentUnits;
  if (percentUnits > 10000 || !Number.isSafeInteger(product))
    throw new Error('Load a valid notice tax percent before collecting.');
  return Math.round(product / 10000);
}
