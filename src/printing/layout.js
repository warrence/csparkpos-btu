import {sprintf as legacySprintf} from 'sprintf-js';

// Rongta's 80mm ESC/POS format has a 72mm/576-dot printable area, not
// 80mm of printable pixels. Font A=12x24, Font B=9x17 at 8 dots/mm.
// Also limits the existing wider RPP04 head when using 80mm media.
// See native-qa/RECEIPT_80MM_REVIEW.md for sources and physical checks.
export const RECEIPT_80MM = Object.freeze({paperWidthMm: 80, printWidthDots: 576,
  fontADots: 12, fontBDots: 9, columns: Math.floor(576 / 12), smallColumns: Math.floor(576 / 9)});

const cellWidth = (char, wideCharWidth = 2) => {
  const code = char.codePointAt(0);
  return code >= 0x1100 && (code <= 0x115f || (code >= 0x2e80 && code <= 0xa4cf) ||
    (code >= 0xac00 && code <= 0xd7a3) || (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0xff01 && code <= 0xff60) || code >= 0x1f300) ? wideCharWidth : 1;
};
export const textWidth = text => Array.from(String(text)).reduce((n,char)=>n+cellWidth(char),0);
export function wrapText(value, columns, wideCharWidth = 2) {
  return String(value == null ? '' : value).split('\n').map(line => {
    const rows=[];let chars=Array.from(line);
    while (chars.length) {
      let width=0, end=0;
      while (end<chars.length && width+cellWidth(chars[end],wideCharWidth)<=columns) {width+=cellWidth(chars[end],wideCharWidth);end+=1;}
      if (!end) throw new Error('Printer column width is too small.');
      if (end===chars.length) {rows.push(chars.join(''));break;}
      let split=end;
      for (let i=end-1;i>0;i--) if (/\s/.test(chars[i]) && chars.slice(0,i).some(c=>! /\s/.test(c))) {split=i;break;}
      rows.push(chars.slice(0,split).join('').replace(/\s+$/,''));
      chars=chars.slice(split);while(chars.length && /\s/.test(chars[0])) chars.shift();
    }
    return rows.length ? rows : [''];
  }).reduce((all,rows)=>all.concat(rows),[]).join('\n');
}
function pad(text, width, right) {
  const spaces=' '.repeat(Math.max(0,width-textWidth(text)));
  return right ? spaces+text : text+spaces;
}
export function tableRow(cells, widths, right = []) {
  const rows=cells.map((cell,i)=>wrapText(cell,widths[i]).split('\n'));
  return Array.from({length:Math.max(...rows.map(row=>row.length))},(_,line)=>
    rows.map((row,i)=>pad(row[line]||'',widths[i],right[i])).join(' ')).join('\n');
}
const money = value => Number(value).toFixed(2);
export function receiptSprintf(format, ...args) {
  const cols=RECEIPT_80MM.columns;
  if (format==='%-30s %-6s %s') return tableRow(args,[cols-20,6,12],[false,false,true]);
  if (format==='%-30.30s %s %13.2f') return tableRow([args[0],args[1],money(args[2])],[cols-20,6,12],[false,false,true]);
  if (format==='%-37s %s') return tableRow(args,[cols-13,12],[false,true]);
  if (format==='%-30.30s %16.2f') return tableRow([args[0],money(args[1])],[cols-13,12],[false,true]);
  if (format==='%-19s %-18s %8s') return tableRow(args,[20,cols-34,12],[false,false,true]);
  if (format==='%-19s %-18s %8.2f') return tableRow([args[0],args[1],money(args[2])],[20,cols-34,12],[false,false,true]);
  if (format==='%37s %9.2f') return tableRow([args[0],money(args[1])],[cols-13,12],[true,true]);
  if (format==='%48s') return pad(String(args[0]),cols,true);
  const footer={'%-30s Total: %9.2f':'Total:', '%-27s Rounding: %9.2f':'Rounding:', '%-26s Net Total: %9.2f':'Net Total:'};
  if (footer[format]) return tableRow([footer[format],money(args[1])],[cols-13,12],[true,true]);
  // Closing uses Font B: five 12-cell columns + four spaces = 64 cells.
  const closingWidths=[12,12,12,12,RECEIPT_80MM.smallColumns-52];
  if (format==='%-8s %-10s %-10s %-10s %-10s') return tableRow(args,closingWidths,[false,true,true,true,true]);
  if (format==='%-8s %-10.2f %-10.2f %-10.2f %-10.2f') return tableRow([args[0],...args.slice(1).map(money)],closingWidths,[false,true,true,true,true]);
  return legacySprintf(format,...args);
}
