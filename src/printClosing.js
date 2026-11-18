import {paItems} from './payments/paReceipts';
import {adviceClosing} from './advice/receipt';
import BluetoothSerial from "react-native-bluetooth-serial";
//import { EscPos } from "escpos-xml";
import realm from "./realm";
import moment from 'moment';
import EscposBuilder from './EscposBuilder';
import {receiptSprintf as sprintf, RECEIPT_80MM} from './printing/layout';
import { bnmRound } from "./helpers";
import {printProfileSnapshot} from './printing/profile';

class printClosing {

  constructor() {
    this.escpos = new EscposBuilder(RECEIPT_80MM);
  }

  initPrinter() {
    // Discard any incomplete previous render before producing another copy.
    this.escpos = new EscposBuilder(RECEIPT_80MM);
    this.generalProfile = null;
    this.generalProfile = printProfileSnapshot(realm);
    //HEADER
    this.escpos
      .init()
      .align('center')
      .text(this.generalProfile.companyName, 'normal', true)
      .printLineFeed()
      .text(`(Co. No. ${this.generalProfile.CompanyNo})`, 'small', false)
      .printLineFeed();
  }

  print(closingDate, userName) {

    this.initPrinter();

    let postingDateStart = moment(closingDate, 'YYYY-MM-DD');
    let postingDateEnd = moment(closingDate, 'YYYY-MM-DD').add(1, 'days');

    const opReceipts = realm.objects('OpReceiptHeader').filtered('receiptDate >= $0 && receiptDate < $1', postingDateStart.toDate(), postingDateEnd.toDate());
    const paReceipts = realm.objects('PaReceiptHeader').filtered('receiptDate >= $0 && receiptDate < $1', postingDateStart.toDate(), postingDateEnd.toDate());
    const couponReceipts = realm.objects('CouponReceiptHeader').filtered('receiptDate >= $0 && receiptDate < $1', postingDateStart.toDate(), postingDateEnd.toDate());

    const adviceReceipts = realm.objects('AdviceReceiptHeader').filtered('receiptDate >= $0 && receiptDate < $1', postingDateStart.toDate(), postingDateEnd.toDate());
    const advice = adviceClosing(adviceReceipts);

    let opTotalAmount = 0;
    let opTotalTax = 0;
    let opRounding = 0;
    let paTotalAmount = 0;
    let paTotalTax = 0;
    let paRounding = 0;
    let couponTotalAmount = 0;
    let couponTotalTax = 0;
    let couponRounding = 0;

    let amount = 0;
    let taxAmount = 0;

    for (let op of opReceipts) {
      amount = op.items.sum('amount');
      taxAmount = op.items.sum('taxAmount');
      opTotalAmount += amount;
      opTotalTax += taxAmount;
      opRounding += bnmRound(amount + taxAmount) - (amount + taxAmount);
    }

    for (let pa of paReceipts) {
      const items=paItems(pa);
      amount = items.reduce((sum,item)=>sum+item.amount+item.opAmount-item.disAmount,0);
      taxAmount = items.reduce((sum,item)=>sum+item.taxAmount,0);
      paTotalAmount += amount;
      paTotalTax += taxAmount;

      paRounding += bnmRound(amount + taxAmount) - (amount + taxAmount);
    }

    for (let coupon of couponReceipts) {
      amount = coupon.items.sum('amount');
      taxAmount = coupon.items.sum('taxAmount');
      couponTotalAmount += amount;
      couponTotalTax += taxAmount;
      couponRounding += bnmRound(amount + taxAmount) - (amount + taxAmount);
    }

    const netTotalAmount = opTotalAmount + paTotalAmount + couponTotalAmount + (advice.base + advice.excess + advice.overdue) / 100;
    const netTotalTax = parseFloat(opTotalTax.toFixed(2)) + parseFloat(paTotalTax.toFixed(2)) + parseFloat(couponTotalTax.toFixed(2)) + advice.tax / 100;
    const netTotalRounding = parseFloat(opRounding.toFixed(2)) + parseFloat(paRounding.toFixed(2)) + parseFloat(couponRounding.toFixed(2)) + advice.rounding / 100;
    const netGrandTotal = opTotalAmount + paTotalAmount + couponTotalAmount +
      parseFloat(opTotalTax.toFixed(2)) + parseFloat(paTotalTax.toFixed(2)) + parseFloat(couponTotalTax.toFixed(2)) +
      parseFloat(opRounding.toFixed(2)) + parseFloat(paRounding.toFixed(2)) + parseFloat(couponRounding.toFixed(2)) + advice.total / 100;

    const pondokIdLine = sprintf('Pondok ID: %s', this.generalProfile.PondokId);
    const wardenIdLine = sprintf('Warden ID: %s', userName);
    const dateClosingLine = sprintf('Closing Date: %s', `${moment(closingDate).format('DD/MM/YYYY')} ${moment().format('H:m')} `);

    const itemTemplateHeader = '%-8s %-10s %-10s %-10s %-10s';
    const itemTemplate = '%-8s %-10.2f %-10.2f %-10.2f %-10.2f';
    const headerLine = sprintf(itemTemplateHeader, 'Type', 'Amount', 'Tax', 'Rounding', 'Total');

    this.escpos
      .printLineFeed()
      .align('left')
      .text(pondokIdLine)
      .printLineFeed()
      .text(wardenIdLine)
      .printLineFeed()
      .text(dateClosingLine)
      .printLineFeed(2)
      .text(headerLine, 'small', false)
      .printLineFeed()
      .text('------------------------------------------------')
      .printLineFeed();

    if (opTotalAmount > 0) {
      this.escpos
        .text(sprintf(itemTemplate, 'OPN', opTotalAmount, opTotalTax, opRounding, parseFloat(opTotalAmount) + parseFloat(opTotalTax) + parseFloat(opRounding)), 'small')
        .printLineFeed();
    }

    if (paTotalAmount > 0) {
      this.escpos
        .text(sprintf(itemTemplate, 'PA', paTotalAmount, paTotalTax, paRounding, parseFloat(paTotalAmount) + parseFloat(paTotalTax) + parseFloat(paRounding)), 'small')
        .printLineFeed();
    }

    if (couponTotalAmount > 0) {
      this.escpos
        .text(sprintf(itemTemplate, 'Coupon', couponTotalAmount, couponTotalTax, couponRounding, parseFloat(couponTotalAmount) + parseFloat(couponTotalTax) + parseFloat(couponRounding)), 'small')
        .printLineFeed();
    }



    if (adviceReceipts.length) {
      this.escpos.text(sprintf(itemTemplate, 'AN', (advice.base + advice.excess + advice.overdue) / 100, advice.tax / 100, advice.rounding / 100, advice.total / 100), 'small').printLineFeed();
    }

    //FOOTER
    this.escpos
      .text('------------------------------------------------')
      .printLineFeed()
      .text(sprintf(itemTemplate, 'Total', netTotalAmount, netTotalTax, netTotalRounding, netGrandTotal), 'small');

    this.escpos.printLineFeed(5);
    const buffer = this.escpos.build();
    return BluetoothSerial.write(buffer);
  }
}

export default printClosing;
