import EscposBuilder from '../src/EscposBuilder';
import {RECEIPT_80MM, receiptSprintf, wrapText, textWidth} from '../src/printing/layout';

test('80mm media uses its documented 576-dot print area and selected font pitches', () => {
  expect(RECEIPT_80MM).toMatchObject({paperWidthMm:80,printWidthDots:576,fontADots:12,fontBDots:9,columns:48,smallColumns:64});
  const bytes=new EscposBuilder(RECEIPT_80MM).init().text('QA', 'small', true).build();
  expect(bytes).toContain('\x1d\x57\x40\x02');
  expect(bytes).toContain('\x1b\x21\x09QA'); // Font B + emphasis, never accidental Font A
});

test('long coupon/notice identifiers wrap completely, money stays right aligned and separators fill the print area', () => {
  const id='QA'+ '1234567890'.repeat(8);
  const rows=receiptSprintf('%-30.30s %s %13.2f',id,'20',999999.99).split('\n');
  expect(rows.every(row=>textWidth(row)<=48)).toBe(true);
  expect(rows[0].endsWith('999999.99')).toBe(true);
  expect(rows.map(row=>row.slice(0,28).trim()).join('')).toBe(id);
  const total=receiptSprintf('%37s %9.2f','Net Total:',999999.99);
  expect(total.length).toBe(48);expect(total.endsWith('999999.99')).toBe(true);
  expect(new EscposBuilder(RECEIPT_80MM).init().text('-'.repeat(48)).build()).toContain('-'.repeat(48));
});

test('address, multi-line and wide-character wrapping retains content within the chosen font columns', () => {
  const text='QA ADDRESS '+ 'LONGIDENTIFIER'.repeat(12)+'\nBintulu 中文';
  const wrapped=wrapText(text,48);
  expect(wrapped.split('\n').every(line=>textWidth(line)<=48)).toBe(true);
  expect(wrapped.replace(/\s/g,'')).toBe(text.replace(/\s/g,''));
});
