import moment from 'moment';
import {cents} from './collection';
import {receiptSprintf as sprintf, RECEIPT_80MM} from '../printing/layout';

// Reprinting and closing describe the cash already collected. They must not
// run a current rounding policy over an archived receipt.
export function storedAdviceTotals(receipt) {
  const totals = {base: 0, excess: 0, tax: 0, overdue: 0,
    rounding: Math.round(receipt.rounding * 100), total: cents(receipt.totalAmount)};
  Array.from(receipt.items).forEach(item => {
    totals.base += cents(item.baseAmount); totals.excess += cents(item.excessCharge);
    totals.tax += cents(item.taxAmount); totals.overdue += cents(item.overdueFee);
  });
  return totals;
}

export function adviceReceiptLines(receipt) {
  const totals = storedAdviceTotals(receipt);
  // Match OPN's invoice / item table / aligned totals layout, but always use
  // the AN's saved components and cash rather than today's downloaded rates.
  const rule = '-'.repeat(RECEIPT_80MM.columns);
  const compoundColumn = receipt.overdue || totals.overdue > 0;
  const taxIncludedPrices = receipt.rulesSnapshot && JSON.parse(receipt.rulesSnapshot).collectionPolicyVersion === 3;
  const totalLine = (label, amount) => sprintf('%37s %9.2f', label, amount / 100);
  const lines = [`Tax Invoice No   : ${receipt.receiptNo}`,
    `Tax Invoice Date: ${moment(receipt.receiptDate).format('DD/MM/YYYY HH:mm')}`,
    `Pondok ID: ${receipt.pondokId}`, `Warden ID: ${receipt.userName}`, '',
    `City: ${receipt.city}`, `Vehicle Reg. No: ${receipt.carNo}`,
    compoundColumn ? sprintf('%-19s %-18s %8s', 'AN No.', 'Compound (RM)', 'Price(RM)') :
      sprintf('%-37s %s', 'AN No.', 'Price(RM)'), rule];
  Array.from(receipt.items).forEach((item, index) => {
    const price = (cents(item.baseAmount) + cents(item.excessCharge) + (taxIncludedPrices ? cents(item.taxAmount) : 0)) / 100;
    // Use the same columns as overdue OPN, with the fee ALREADY stored on
    // this item. Never allocate today's fee or reconstruct old coupon groups.
    const storedFee = cents(item.overdueFee);
    const compound = index > 0 && storedFee === 0 ? '' : (storedFee / 100).toFixed(2);
    lines.push(compoundColumn ? sprintf('%-19s %-18s %8.2f', item.noticeNo, compound, price) :
      sprintf('%-30.30s %16.2f', item.noticeNo, price));
  });
  // Stored item rates came from the collection policy/notice. Never substitute
  // today's profile rate on reprint. Historical mixed rates get separate rows.
  const taxes = new Map();
  Array.from(receipt.items).forEach(item => {
    const rate = Number(item.taxRate);
    taxes.set(rate, (taxes.get(rate) || 0) + cents(item.taxAmount));
  });
  lines.push(rule, totalLine('Total:', totals.base + totals.excess));
  Array.from(taxes.keys()).sort((a, b) => a - b).forEach(rate => lines.push(totalLine(`${rate}% of Tax:`, taxes.get(rate))));
  lines.push(totalLine('Sub Total:', totals.base + totals.excess + totals.tax), totalLine('Rounding:', totals.rounding));
  lines.push(sprintf('%48s', '----------------------'), totalLine('Net Total:', totals.total));
  return lines;
}

export function adviceClosing(receipts) {
  return Array.from(receipts).reduce((sum, receipt) => {
    const totals = storedAdviceTotals(receipt);
    Object.keys(sum).forEach(key => {sum[key] += totals[key];});
    return sum;
  }, {base: 0, excess: 0, tax: 0, overdue: 0, rounding: 0, total: 0});
}
