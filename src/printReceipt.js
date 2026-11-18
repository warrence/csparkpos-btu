import {hasOpnVehicle, sharedOpnVehicle} from './payments/opnVehicle';
import {paItems} from './payments/paReceipts';
import {adviceReceiptLines} from './advice/receipt';
import {cents} from './advice/collection';
import BluetoothSerial from 'react-native-bluetooth-serial';
import {DeviceEventEmitter} from 'react-native';
//import { EscPos } from "escpos-xml";
import realm from './realm';
import moment from 'moment';
import EscposBuilder from './EscposBuilder';
import {receiptSprintf as sprintf, RECEIPT_80MM} from './printing/layout';
import { bnmRound } from './helpers';
import {printProfileSnapshot} from './printing/profile';

class printReceipt {

  constructor() {
    this.escpos = new EscposBuilder(RECEIPT_80MM);
  }

  initPrinter() {
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
      .printLineFeed()
      .text(`(ST ID No. ${this.generalProfile.GstRegNo}`, 'small', false)
      .printLineFeed();

    if (this.generalProfile.Address1 !== '') {
      this.escpos.text(this.generalProfile.Address1, 'small', false).printLineFeed();
    }

    if (this.generalProfile.Address2 !== '') {
      this.escpos.text(this.generalProfile.Address2, 'small', false).printLineFeed();
    }

    if (this.generalProfile.Address3 !== '') {
      this.escpos.text(this.generalProfile.Address3, 'small', false).printLineFeed();
    }

    const phoneNumber = [this.generalProfile.Telephone1, this.generalProfile.Telephone2, this.generalProfile.Telephone3]
      .filter(value => value != null && String(value).trim() !== '')
      .map(value => String(value).trim()).join(' ');
    if (phoneNumber) {
      this.escpos.text(phoneNumber, 'small', false).printLineFeed();
    }
  }

  print(type, receiptNo = null) {
    const advice = type === 'an' ? realm.objectForPrimaryKey('AdviceReceiptHeader', receiptNo) : null;
    if (type === 'an' && !advice)
      throw new Error('Advice receipt not found locally. Successfully posted receipts are removed from this tablet.');
    this.initPrinter();

    if (type === 'an') {
      const receipt = advice;
      this.escpos.align('left').printLineFeed();
      adviceReceiptLines(receipt).forEach(line => this.escpos.text(line).printLineFeed());
      this.escpos.text('================================================').printLineFeed()
        .align('center').text('Thank You!', 'big', true).printLineFeed(3);
      return this.writePaymentReceipt();
    }

    if (type === 'test') {
      return this.printTestReceipt();
    }

    if (type === 'coupon') {
      this.printCouponReceipt(receiptNo);
    }

    if (type === 'op') {
      return this.printOpReceipt(receiptNo);
    }

    if (type === 'oc') {
      return this.printOcReceipt(receiptNo);
    }

    if (type === 'pa') {
      return this.printPaReceipt(receiptNo);
    }

    if (type === 'mbill') {
      this.printMBillReceipt(receiptNo);
    }
  }

  writePaymentReceipt() {
    // Keep the existing footer feed and add exactly two tear-off lines once.
    // All payment copies and reprints finish here; raw/test writes do not.
    this.escpos.printLineFeed(2);
    return this.writeAdvice(this.escpos.build());
  }

  async writeAdvice(buffer) {
    if (!await BluetoothSerial.isConnected()) throw new Error('Printer is not connected.');
    let writeError;
    const subscription = DeviceEventEmitter.addListener('error', error => {writeError = error;});
    try {
      const accepted = await BluetoothSerial.write(buffer);
      if (writeError) throw new Error(writeError.message || 'Printer write failed.');
      if (accepted !== true) throw new Error('Printer did not accept the receipt.');
      return true;
    } finally { subscription.remove(); }
  }

  printTestReceipt() {
    // Settings test only: generated in memory, never a saved financial receipt.
    this.escpos.align('center').text('TEST ONLY - NOT A PAYMENT', 'normal', true)
      .printLineFeed().text('80mm paper / 72mm printable').printLineFeed()
      .align('left').text('Font A - both L/R markers must be visible').printLineFeed()
      .text('L' + '-'.repeat(RECEIPT_80MM.columns - 2) + 'R').printLineFeed()
      .text('Font B - both L/R markers must be visible', 'small').printLineFeed()
      .text('L' + '-'.repeat(RECEIPT_80MM.smallColumns - 2) + 'R', 'small').printLineFeed()
      .text('WRAP TEST: LONG_IDENTIFIER_'.repeat(4)).printLineFeed();
    const taxInvoiceNoLine = sprintf('Tax Invoice No   : %s', 'ABC1234567890');
    const taxInvoiceDateLine = sprintf('Tax Invoice Date: %s', '15/07/2018 16:53');
    const pondokIdLine = sprintf('Pondok ID: %s', 'MTT');
    const wardenIdLine = sprintf('Warden ID: %s', 'S-1');

    const itemTemplateHeader = '%-30s %-6s %s';
    const itemTemplate = '%-30.30s %s %13.2f';
    const headerLine = sprintf(itemTemplateHeader, 'Coupon No.', 'Type', 'Price(RM)');
    const data = [
      {
        couponNo: 'AN88888888-AN88888898',
        type: '20',
        price: 12.30
      },
      {
        couponNo: 'AN77777777',
        type: '50',
        price: 1.20
      }
    ];

    this.escpos
      .printLineFeed()
      .align('left')
      .text(taxInvoiceNoLine)
      .printLineFeed()
      .text(taxInvoiceDateLine)
      .printLineFeed()
      .text(pondokIdLine)
      .printLineFeed()
      .text(wardenIdLine)
      .printLineFeed(2)
      .text(headerLine, 'normal', false)
      .printLineFeed()
      .text('------------------------------------------------')
      .printLineFeed();

    //ITEM LOOP
    data.map((item) => {
      this.escpos
        .text(sprintf(itemTemplate, item.couponNo, item.type, item.price))
        .printLineFeed();
    });

    //FOOTER
    this.escpos
      .text('------------------------------------------------')
      .printLineFeed()
      .text(sprintf('%-30s Total: %9.2f', '', 13.5))
      .printLineFeed()
      .text(sprintf('%-27s Rounding: %9.2f', '', 0.00))
      .printLineFeed()
      .text(sprintf('%-26s Net Total: %9.2f', '', 13.5))
      .printLineFeed()
      .text('================================================')
      .printLineFeed()
      .text(sprintf('GST Summary    Amount(RM)    Tax(RM)'))
      .printLineFeed()
      .text(sprintf('SR0 %21.2f %10.2f', 13.5, 0))
      .printLineFeed()
      .text('================================================')
      .printLineFeed()
      .align('center')
      .text('Thank You!', 'big', true)
      .printLineFeed();

    this.escpos.printLineFeed(2);
    const buffer = this.escpos.build();
    return this.writeAdvice(buffer);
  }

  printCouponReceipt(receiptNo) {
    const receipt = realm.objects('CouponReceiptHeader').filtered(`receiptNo = "${receiptNo}"`)[0];
    const receiptDate = new Date(receipt.receiptDate);

    const taxInvoiceNoLine = sprintf('Tax Invoice No   : %s', receipt.receiptNo);
    const taxInvoiceDateLine = sprintf('Tax Invoice Date: %s', moment(receiptDate).format('DD/MM/YYYY HH:mm'));
    const pondokIdLine = sprintf('Pondok ID: %s', this.generalProfile.PondokId);
    const wardenIdLine = sprintf('Warden ID: %s', receipt.userName);

    const itemTemplateHeader = '%-30s %-6s %s';
    const itemTemplate = '%-30.30s %s %13.2f';
    const headerLine = sprintf(itemTemplateHeader, 'Coupon No.', 'Type', 'Price(RM)');

    this.escpos
      .printLineFeed()
      .align('left')
      .text(taxInvoiceNoLine)
      .printLineFeed()
      .text(taxInvoiceDateLine)
      .printLineFeed()
      .text(pondokIdLine)
      .printLineFeed()
      .text(wardenIdLine)
      .printLineFeed(2)
      .text(headerLine, 'normal', false)
      .printLineFeed()
      .text('------------------------------------------------')
      .printLineFeed();

    //ITEM LOOP
    let totalAmount = 0;
    let totalTax = 0;
    receipt.items.map((item) => {
      this.escpos
        .text(sprintf(itemTemplate,
          `${item.startingCouponNo}-${item.endingCouponNo}`,
          item.couponType,
          item.amount
        ))
        .printLineFeed();
      totalAmount += item.amount;
      //totalTax += item.taxAmount;
    });

    totalTax = (totalAmount * this.generalProfile.Tax) / 100;
    const grandTotal = bnmRound(totalAmount + totalTax);
    const rounding = grandTotal - (totalAmount + totalTax);

    //FOOTER
    this.escpos
      .text('------------------------------------------------')
      .printLineFeed()
      .text(sprintf('%37s %9.2f', 'Total:', totalAmount))
      .printLineFeed()
      .text(sprintf('%37s %9.2f', `${this.generalProfile.Tax}% of Tax:`, totalTax))
      .printLineFeed()
      .text(sprintf('%37s %9.2f', 'Sub Total:', totalAmount + totalTax))
      .printLineFeed()
      .text(sprintf('%37s %9.2f', 'Rounding:', rounding))
      .printLineFeed()
      .text(sprintf('%48s', '----------------------'))
      .printLineFeed()
      .text(sprintf('%37s %9.2f', 'Net Total:', grandTotal))
      .printLineFeed()
      /*
      .text('================================================')
      .printLineFeed()
      .text(sprintf('GST Summary    Amount(RM)    Tax(RM)'))
      .printLineFeed()
      .text(sprintf('SR0 %21.2f %10.2f', totalAmount, totalTax))
      .printLineFeed()
      */
      .text('================================================')
      .printLineFeed()
      .align('center')
      .text('Thank You!', 'big', true)
      .printLineFeed();

    this.escpos.printLineFeed(2);
    const buffer = this.escpos.build();
    BluetoothSerial.write(buffer);
  }

  printOpReceipt(receiptNo) {
    const receipt = realm.objects('OpReceiptHeader').filtered(`receiptNo = "${receiptNo}"`)[0];
    const receiptDate = new Date(receipt.receiptDate);


    const taxInvoiceNoLine = sprintf('Tax Invoice No   : %s', receipt.receiptNo);
    const taxInvoiceDateLine = sprintf('Tax Invoice Date: %s', moment(receiptDate).format('DD/MM/YYYY HH:mm'));
    const pondokIdLine = sprintf('Pondok ID: %s', this.generalProfile.PondokId);
    const wardenIdLine = sprintf('Warden ID: %s', receipt.userName);
    const cityLine = sprintf('City: %s', receipt.city);

    const itemTemplateHeader = '%-37s %s';
    const itemTemplate = '%-30.30s %16.2f';
    const headerLine = sprintf(itemTemplateHeader, 'OPN No.', 'Price(RM)');

    this.escpos
      .printLineFeed()
      .align('left')
      .text(taxInvoiceNoLine)
      .printLineFeed()
      .text(taxInvoiceDateLine)
      .printLineFeed()
      .text(pondokIdLine)
      .printLineFeed()
      .text(wardenIdLine)
      .printLineFeed(2)
      .text(cityLine)
      .printLineFeed();

    // Only a fully shared item vehicle can describe the entire receipt.
    const sharedVehicle = sharedOpnVehicle(receipt.items);
    if (sharedVehicle) {
      this.escpos.text(sprintf('Vehicle Reg. No: %s', sharedVehicle)).printLineFeed();
    }

    this.escpos
      .text(headerLine, 'normal', false)
      .printLineFeed()
      .text('------------------------------------------------')
      .printLineFeed();

    //ITEM LOOP
    let totalAmount = 0;
    let totalTax = 0;
    const perNoticeTax = receipt.taxPolicyVersion === 3;
    let baseCents = 0, taxCents = 0;
    const storedRates = new Set(Array.from(receipt.items).map(item => Number(item.tax)));
    receipt.items.map((item) => {
      this.escpos
        .text(sprintf(itemTemplate,
          `${item.opNo}`,
          perNoticeTax ? (cents(item.amount) + cents(item.taxAmount)) / 100 : item.amount
        ))
        .printLineFeed();
      if (!sharedVehicle && hasOpnVehicle(item.carNo)) {
        this.escpos.text(sprintf('Vehicle Reg. No: %s', item.carNo)).printLineFeed();
      }
      totalAmount += item.amount;
      if (perNoticeTax) {baseCents += cents(item.amount);taxCents += cents(item.taxAmount);}
    });

    if (!perNoticeTax) totalTax = (totalAmount * this.generalProfile.Tax) / 100;
    else {totalAmount = baseCents / 100;totalTax = taxCents / 100;}
    const taxLabel = perNoticeTax ? storedRates.size === 1 ? `${Array.from(storedRates)[0]}% of Tax:` : 'Tax:' : `${this.generalProfile.Tax}% of Tax:`;
    const grandTotal = perNoticeTax ? Math.round((baseCents + taxCents) / 5) * 5 / 100 : bnmRound(totalAmount + totalTax);
    const rounding = perNoticeTax ? (Math.round((baseCents + taxCents) / 5) * 5 - baseCents - taxCents) / 100 : grandTotal - (totalAmount + totalTax);

    //FOOTER
    this.escpos
      .text('------------------------------------------------')
      .printLineFeed()
      .text(sprintf('%37s %9.2f', 'Total:', totalAmount))
      .printLineFeed()
      .text(sprintf('%37s %9.2f', taxLabel, totalTax))
      .printLineFeed()
      .text(sprintf('%37s %9.2f', 'Sub Total:', totalAmount + totalTax))
      .printLineFeed()
      .text(sprintf('%37s %9.2f', 'Rounding:', rounding))
      .printLineFeed()
      .text(sprintf('%48s', '----------------------'))
      .printLineFeed()
      .text(sprintf('%37s %9.2f', 'Net Total:', grandTotal))
      .printLineFeed()
      /*
      .text('================================================')
      .printLineFeed()
      .text(sprintf('GST Summary    Amount(RM)    Tax(RM)'))
      .printLineFeed()
      .text(sprintf('SR0 %21.2f %10.2f', totalAmount, totalTax))
      .printLineFeed()
      */
      .text('================================================')
      .printLineFeed()
      .align('center')
      .text('Thank You!', 'big', true)
      .printLineFeed();

    this.escpos.printLineFeed(2);
    return this.writePaymentReceipt();
  }

  printOcReceipt(receiptNo) {
    const receipt = realm.objects('PaReceiptHeader').filtered(`receiptNo = "${receiptNo}"`)[0];
    const receiptDate = new Date(receipt.receiptDate);


    const taxInvoiceNoLine = sprintf('Tax Invoice No   : %s', receipt.receiptNo);
    const taxInvoiceDateLine = sprintf('Tax Invoice Date: %s', moment(receiptDate).format('DD/MM/YYYY HH:mm'));
    const pondokIdLine = sprintf('Pondok ID: %s', this.generalProfile.PondokId);
    const wardenIdLine = sprintf('Warden ID: %s', receipt.userName);
    const cityLine = sprintf('City: %s', receipt.city);
    const carNoLine = sprintf('Vehicle Reg. No: %s', receipt.carNo);
    const reminderNoLine = sprintf('Reminder No: %s', receipt.reminderNo);

    const itemTemplateHeader = '%-19s %-18s %8s';
    const itemTemplate = '%-19s %-18s %8.2f';
    const headerLine = sprintf(itemTemplateHeader, 'OPN No.', 'Compound (RM)', 'Price(RM)');

    this.escpos
      .printLineFeed()
      .align('left')
      .text(taxInvoiceNoLine)
      .printLineFeed()
      .text(taxInvoiceDateLine)
      .printLineFeed()
      .text(pondokIdLine)
      .printLineFeed()
      .text(wardenIdLine)
      .printLineFeed(2)
      .text(cityLine)
      .printLineFeed()
      .text(carNoLine)
      .printLineFeed()
      .text(reminderNoLine)
      .printLineFeed()
      .printLineFeed()
      .text(headerLine, 'normal', false)
      .printLineFeed()
      .text('------------------------------------------------')
      .printLineFeed();

    //ITEM LOOP
    let totalAmount = 0;
    let totalTax = 0;
    paItems(receipt).map((item) => {
      this.escpos
        .text(sprintf(itemTemplate,
          `${item.paNo}`,
          item.amount.toFixed(2),
          (item.opAmount + item.taxAmount).toFixed(2)
        ))
        .printLineFeed();
      totalAmount += item.amount + item.opAmount;
      totalTax += item.taxAmount;
    });

    const grandTotal = totalAmount + totalTax;
    const rounding = bnmRound(grandTotal) - grandTotal;
    const netTotal = grandTotal + rounding;

    //FOOTER
    this.escpos
      .text('------------------------------------------------')
      .printLineFeed()
      .text(sprintf('%37s %9.2f', 'Total:', grandTotal.toFixed(2)))
      .printLineFeed()
      .text(sprintf('%37s %9.2f', 'Rounding:', rounding.toFixed(2)))
      .printLineFeed()
      .text(sprintf('%37s %9.2f', `Net Total included ${this.generalProfile.Tax}% of Tax:`, netTotal.toFixed(2)))
      .printLineFeed()
      /*
      .text('================================================')
      .printLineFeed()
      .text(sprintf('GST Summary    Amount(RM)    Tax(RM)'))
      .printLineFeed()
      .text(sprintf('SR0 %21.2f %10.2f', totalAmount.toFixed(2), totalTax.toFixed(2)))
      .printLineFeed()
      */
      .text('================================================')
      .printLineFeed()
      .align('center')
      .text('Thank You!', 'big', true)
      .printLineFeed();

    this.escpos.printLineFeed(2);
    return this.writePaymentReceipt();
  }

  printPaReceipt(receiptNo) {
    const receipt = realm.objects('PaReceiptHeader').filtered(`receiptNo = "${receiptNo}"`)[0];
    const receiptDate = new Date(receipt.receiptDate);


    const taxInvoiceNoLine = sprintf('Invoice No   : %s', receipt.receiptNo);
    const taxInvoiceDateLine = sprintf('Invoice Date: %s', moment(receiptDate).format('DD/MM/YYYY HH:mm'));
    const pondokIdLine = sprintf('Pondok ID: %s', this.generalProfile.PondokId);
    const wardenIdLine = sprintf('Warden ID: %s', receipt.userName);
    const cityLine = sprintf('City: %s', receipt.city);
    const carNoLine = sprintf('Vehicle Reg. No: %s', receipt.carNo);
    const reminderNoLine = sprintf('Reminder No: %s', receipt.reminderNo);

    const itemTemplateHeader = '%-19s %-18s %8s';
    const itemTemplate = '%-19s %-18s %8.2f';
    const itemDiscountTemplate = '%-19s';
    const headerLine = sprintf(itemTemplateHeader, 'PA No.', 'Offence', 'Price(RM)');

    this.escpos
      .printLineFeed()
      .align('left')
      .text(taxInvoiceNoLine)
      .printLineFeed()
      .text(taxInvoiceDateLine)
      .printLineFeed()
      .text(pondokIdLine)
      .printLineFeed()
      .text(wardenIdLine)
      .printLineFeed(2)
      .text(cityLine)
      .printLineFeed()
      .text(carNoLine)
      .printLineFeed()
      .text(reminderNoLine)
      .printLineFeed()
      .printLineFeed()
      .text(headerLine, 'normal', false)
      .printLineFeed()
      .text('------------------------------------------------')
      .printLineFeed();

    //ITEM LOOP
    let totalAmount = 0;
    let totalTax = 0;
    paItems(receipt).map((item) => {
        if (item.disAmount > 0) {
            this.escpos
            .text(sprintf(itemTemplate,
              `${item.paNo}`,
              item.offence,
              (item.amount - item.disAmount + item.taxAmount).toFixed(2)
            ))
            .printLineFeed()          
            .text(sprintf(itemDiscountTemplate,
              `*** PA ${item.amount + item.taxAmount} DIS (${item.disPercent}): ${item.disAmount}`
            ))
            .printLineFeed();
          } else {
            this.escpos
            .text(sprintf(itemTemplate,
              `${item.paNo}`,
              item.offence,
              (item.amount - item.disAmount + item.taxAmount).toFixed(2)
            ))
            .printLineFeed();
          }
      totalAmount += item.amount - item.disAmount + item.taxAmount;
      totalTax += item.taxAmount;
    });

    //FOOTER
    this.escpos
      .text('------------------------------------------------')
      .printLineFeed()
      .text(sprintf('%-30s Total: %9.2f', '', totalAmount.toFixed(2)))
      .printLineFeed()
      .text(sprintf('%-27s Rounding: %9.2f', '', 0.00))
      .printLineFeed()
      .text(sprintf('%48s', '----------------------'))
      .printLineFeed()
      .text(sprintf('%-26s Net Total: %9.2f', '', totalAmount.toFixed(2)))
      .printLineFeed()
      /*
      .text('================================================')
      .printLineFeed()
      .text(sprintf('GST Summary    Amount(RM)    Tax(RM)'))
      .printLineFeed()
      .text(sprintf('SR0 %21.2f %10.2f', totalAmount.toFixed(2), totalTax.toFixed(2)))
      .printLineFeed()
      */
      .text('================================================')

      .printLineFeed()
      .align('center')
      .text('Thank You!', 'big', true)
      .printLineFeed();

    this.escpos.printLineFeed(2);
    return this.writePaymentReceipt();
  }


  printMBillReceipt(receiptNo) {
    const receipt = realm.objects('MBillReceiptHeader').filtered(`receiptNo = "${receiptNo}"`)[0];
    const receiptDate = new Date(receipt.receiptDate);

    const taxInvoiceNoLine = sprintf('Tax Invoice No   : %s', receipt.receiptNo);
    const taxInvoiceDateLine = sprintf('Invoice Date: %s', moment(receiptDate).format('DD/MM/YYYY HH:mm'));
    const pondokIdLine = sprintf('Pondok ID: %s', this.generalProfile.PondokId);
    const wardenIdLine = sprintf('Warden ID: %s', receipt.userName);
    // const cityLine = sprintf('City: %s', receipt.city);
    // const itemTemplateHeader = '%-37s %s';
    const itemTemplateHeader = '%-19s %-18s %8s';
    // const itemTemplate = '%-30.30s %16.2f';
    const itemTemplate = '%-19s %-18s %8.2f';
    const headerLine = sprintf(itemTemplateHeader, 'MBill No.', 'City', 'Price(RM)');

    this.escpos
      .printLineFeed()
      .align('left')
      .text(taxInvoiceNoLine)
      .printLineFeed()
      .text(taxInvoiceDateLine)
      .printLineFeed()
      .text(pondokIdLine)
      .printLineFeed()
      .text(wardenIdLine)
      // .printLineFeed()
      // .text(cityLine)
      .printLineFeed(2)
      .text(headerLine, 'normal', false)
      .printLineFeed()
      .text('------------------------------------------------')
      .printLineFeed();

    //ITEM LOOP
    let totalAmount = 0;
    const totalTax = 0;
    receipt.items.map((item) => {
      this.escpos
        .text(sprintf(itemTemplate,
          `${item.mBillNo}`,
          item.city,
          item.amount
        ))
        .printLineFeed();
      totalAmount += item.amount;
    });

    // totalTax = (totalAmount * this.generalProfile.Tax) / 100;

    const grandTotal = bnmRound(totalAmount + totalTax);
    const rounding = grandTotal - (totalAmount + totalTax);

    //FOOTER
    this.escpos
      .text('------------------------------------------------')
      .printLineFeed()
      .text(sprintf('%37s %9.2f', 'Total:', totalAmount))
      // .printLineFeed()
      // .text(sprintf('%37s %9.2f', `${this.generalProfile.Tax}% of Tax:`, totalTax))
      .printLineFeed()
      .text(sprintf('%37s %9.2f', 'Sub Total:', totalAmount + totalTax))
      .printLineFeed()
      .text(sprintf('%37s %9.2f', 'Rounding:', rounding))
      .printLineFeed()
      .text(sprintf('%48s', '----------------------'))
      .printLineFeed()
      .text(sprintf('%37s %9.2f', 'Net Total:', grandTotal))
      .printLineFeed()
      /*
      .text('================================================')
      .printLineFeed()
      .text(sprintf('GST Summary    Amount(RM)    Tax(RM)'))
      .printLineFeed()
      .text(sprintf('SR0 %21.2f %10.2f', totalAmount, totalTax))
      .printLineFeed()
      */
      .text('================================================')
      .printLineFeed()
      .align('center')
      .text('Thank You!', 'big', true)
      .printLineFeed();

    this.escpos.printLineFeed(2);
    const buffer = this.escpos.build();
    BluetoothSerial.write(buffer);
  }
}

export default printReceipt;
