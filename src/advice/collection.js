import moment from 'moment';
import {noticeTaxCents} from '../payments/noticeTax';

export function cents(value, label = 'Amount') {
  const text = String(value == null ? '' : value).trim();
  if (!/^\d+(\.\d{1,2})?$/.test(text)) throw new Error(`${label} must be a non-negative amount with at most two decimal places.`);
  const result = Math.round(Number(text) * 100);
  if (!Number.isSafeInteger(result)) throw new Error(`${label} is too large.`);
  return result;
}

export const money = value => (value / 100).toFixed(2);

export function validateFixedAdvicePolicy(rules) {
  if (!rules || ![2,3].includes(rules.collectionPolicyVersion) || rules.feeBasis !== 'receipt')
    throw new Error('Load the confirmed fixed Advice Note policy before collecting.');
  const base = cents(rules.baseAmount, 'Configured Advice base amount');
  const excess = cents(rules.excessCharges, 'Configured Advice excess charge');
  if (base + excess <= 0 || base > 999999 || excess > 999999)
    throw new Error('Load valid Advice amounts from office settings before collecting.');
  const percent = cents(rules.taxPercent, 'Configured Advice tax percent');
  if (percent > 10000 || (rules.taxEnabled ? percent <= 0 : percent !== 0))
    throw new Error('Load a valid configured Advice tax policy before collecting.');
  return rules;
}

export function adviceTotals(items) {
  const totals = {base: 0, excess: 0, tax: 0, overdue: 0};
  items.forEach(item => {
    totals.base += cents(item.baseAmount, 'Base amount');
    totals.excess += cents(item.excessCharge, 'Excess charge');
    totals.tax += cents(item.taxAmount, 'Tax');
    totals.overdue += cents(item.overdueFee, 'Overdue fee');
  });
  totals.subtotal = totals.base + totals.excess + totals.tax;
  totals.rounding = Math.round(totals.subtotal / 5) * 5 - totals.subtotal;
  totals.total = totals.subtotal + totals.rounding + totals.overdue;
  return totals;
}

// Snapshot the components entered from the notice and the downloaded rate.
// Excess and overdue fees are tax-free in the verified Bintulu reference.
export function adviceItem(draft, rules, overdue) {
  const {taxEnabled, overdueFee} = rules;
  const fixed = [2,3].includes(rules.collectionPolicyVersion);
  if (fixed) validateFixedAdvicePolicy(rules);
  const noticeNo = String(draft.noticeNo || '').trim().toUpperCase();
  const city = String(draft.city || '').trim();
  const carNo = String(draft.carNo || '').replace(/\s/g, '').toUpperCase();
  if (noticeNo.length > 12) throw new Error('Advice notice number must be at most 12 characters.');
  if (!noticeNo || !city || !carNo) throw new Error('Notice number, city and vehicle number are required.');
  if (!moment(draft.noticeDate, 'YYYY-MM-DD', true).isValid()) throw new Error('Enter a valid notice date (YYYY-MM-DD).');
  const couponNo = fixed ? '' : String(draft.couponNo || '').trim();
  if (!fixed && overdue && !couponNo) throw new Error('Coupon number is required for an overdue advice notice.');
  const base = cents(fixed ? rules.baseAmount : draft.baseAmount, 'Base amount');
  const excess = cents(fixed ? rules.excessCharges : draft.excessCharge, 'Excess charge');
  const rate = taxEnabled ? cents(fixed ? rules.taxPercent : draft.taxRate, 'Tax percent') / 100 : 0;
  if (rate > 100) throw new Error('Tax percent cannot exceed 100.');
  const tax = taxEnabled ? fixed ? Math.round(base * rate / 100) : cents(draft.taxAmount, 'Tax on notice') : 0;
  const fee = overdue ? cents(overdueFee, 'Advice overdue fee') : 0;
  if (base + excess > 999999 || tax > 999999 || fee > 999999) throw new Error('Notice amounts exceed the supported office limit.');
  if (city.length > 10 || carNo.length > 10 || couponNo.length > 50) throw new Error('City, vehicle or coupon number exceeds the office limit.');
  return {noticeNo, city, carNo, couponNo, noticeDate: moment(draft.noticeDate, 'YYYY-MM-DD').toDate(),
    baseAmount: base / 100, excessCharge: excess / 100, taxRate: rate,
    taxAmount: tax / 100, overdueFee: fee / 100};
}

// Legacy receipts use coupon groups. Policy v2 uses one configured fee per
// receipt. V2 keeps cumulative tax cents; V3 rounds each notice tax to cents.
export function adviceBasket(items, overdue, feeBasis, policyVersion) {
  if (feeBasis && feeBasis !== 'receipt') throw new Error('Unsupported advice overdue fee basis.');
  const seen = new Set();
  const notices = new Set();
  let taxUnits = 0, allocatedTax = 0;
  const ordered = feeBasis ? items.slice().sort((a, b) => a.noticeNo < b.noticeNo ? -1 : a.noticeNo > b.noticeNo ? 1 : 0) : items;
  return ordered.map(item => {
    const notice = `${item.city}|${item.noticeNo}`;
    if (notices.has(notice)) throw new Error('This advice notice is already selected.');
    notices.add(notice);
    if (items[0] && (item.city !== items[0].city || item.carNo !== items[0].carNo)) throw new Error('Use one city and vehicle per advice receipt.');
    // Unmarked historical collections retain coupon grouping. Fixed-policy
    // collections explicitly select receipt; blank coupons are never a key.
    const group = feeBasis === 'receipt' ? 'receipt' : item.couponNo;
    const fee = overdue && !seen.has(group) ? item.overdueFee : 0;
    seen.add(group);
    let taxAmount = item.taxAmount;
    if (feeBasis && policyVersion === 3) {
      taxAmount = noticeTaxCents(cents(item.baseAmount), item.taxRate) / 100;
    } else if (feeBasis) {
      taxUnits += cents(item.baseAmount) * cents(item.taxRate, 'Tax percent');
      const cumulative = Math.round(taxUnits / 10000);
      taxAmount = (cumulative - allocatedTax) / 100;
      allocatedTax = cumulative;
    }
    return {...item, taxAmount, overdueFee: fee};
  });
}

