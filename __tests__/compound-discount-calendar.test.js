import {compoundDiscountPercent} from '../src/payments/compoundDiscount';
import {execFileSync} from 'child_process';
const today=new Date('2026-10-19T23:59:59+08:00');
const primary={dayPay:14,disPercent:50,dayPay2:0,disPercent2:0};
const issued=age=>new Date(Date.UTC(2026,9,19-age,8,42,12));
test('reproduces old zero-secondary shadow and fixes today without changing configured rates',()=>{
 const cutoff2=new Date(today);cutoff2.setDate(cutoff2.getDate()-primary.dayPay2);cutoff2.setHours(0,0,0,0);
 const oldPercent=issued(0)>=cutoff2?primary.disPercent2:primary.disPercent;
 expect(oldPercent).toBe(0);expect(compoundDiscountPercent(primary,issued(0),today)).toBe(50);expect(primary).toEqual({dayPay:14,disPercent:50,dayPay2:0,disPercent2:0});
});
test.each([[0,50],[1,50],[13,50],[14,0],[15,0]])('inactive second tier: age%i returns%s percent with issue date counted as day 1', (age,percent)=>expect(compoundDiscountPercent(primary,issued(age),today)).toBe(percent));
test.each([[0,20],[1,20],[6,20],[7,10],[13,10],[14,0],[15,0]])('both configured tiers: age%i returns%s with tier2 precedence',(age,percent)=>expect(compoundDiscountPercent({dayPay:14,disPercent:10,dayPay2:7,disPercent2:20},issued(age),today)).toBe(percent));
test.each([0,1,13])('calendar comparisons ignore selected time components at age%i',age=>{
 for(const hour of [0,12,23])expect(compoundDiscountPercent(primary,new Date(Date.UTC(2026,9,19-age,hour-8,59,59)),new Date('2026-10-19T00:00:01+08:00'))).toBe(50);
});
test('future dates are rejected rather than given a discount',()=>expect(()=>compoundDiscountPercent(primary,issued(-1),today)).toThrow('Compound date cannot be in the future.'));
test('zero-day tiers do not include issue day 1; only unused zero-day zero-percent tier is disabled',()=>{
 const sameDay={...primary,disPercent2:75};expect(compoundDiscountPercent(sameDay,issued(0),today)).toBe(50);expect(compoundDiscountPercent(sameDay,issued(1),today)).toBe(50);
 expect(compoundDiscountPercent({...primary,dayPay2:7},issued(0),today)).toBe(0);
 expect(compoundDiscountPercent({...primary,disPercent:0},issued(0),today)).toBe(0);
});
test.each([null,{...primary,dayPay:-1},{...primary,dayPay2:1.5},{...primary,disPercent:101},{...primary,disPercent2:undefined}])('invalid settings%j never infer a rate',offence=>expect(()=>compoundDiscountPercent(offence,issued(0),today)).toThrow('Load valid compound discount settings'));
test('Asia/Kuching offset timestamps retain local collection/issue day at midnight',()=>{
 const script=`const fs=require('fs'),Module=require('module'),babel=require('@babel/core'),root=process.cwd();const original=Module._extensions['.js'];Module._extensions['.js']=(m,f)=>f.startsWith(root+'/src/')?m._compile(babel.transformSync(fs.readFileSync(f,'utf8'),{filename:f}).code,f):original(m,f);const fn=require('./src/payments/compoundDiscount').compoundDiscountPercent;const rules={dayPay:14,disPercent:50,dayPay2:0,disPercent2:0};const now=new Date('2026-10-19T00:00:01+08:00');console.log(JSON.stringify({timezone:Intl.DateTimeFormat().resolvedOptions().timeZone,today:fn(rules,new Date('2026-10-19T23:59:59+08:00'),now),yesterday:fn(rules,new Date('2026-10-18T23:59:59+08:00'),now),last:fn(rules,new Date('2026-10-06T00:00:00+08:00'),now),outside:fn(rules,new Date('2026-10-04T23:59:59+08:00'),now)}));`;
 const result=JSON.parse(execFileSync(process.execPath,['-e',script],{cwd:process.cwd(),env:{...process.env,TZ:'Asia/Kuching'},encoding:'utf8'}));expect(result).toEqual({timezone:'Asia/Kuching',today:50,yesterday:50,last:50,outside:0});
});

test.each([[0,50],[1,50],[9998,50],[9999,0],[10000,0]])('verified production-shaped9999/50/0/0 config at age%i returns%s without rate assumptions',(age,percent)=>expect(compoundDiscountPercent({...primary,dayPay:9999},issued(age),today)).toBe(percent));

test('API parity: configured tier2 zero-percent takes precedence through its inclusive boundary',()=>{
 const rule={dayPay:14,disPercent:80,dayPay2:3,disPercent2:0};
 expect(compoundDiscountPercent(rule,'2026-10-07','2026-10-09',[])).toBe(0);
 expect(compoundDiscountPercent(rule,'2026-10-07','2026-10-12',['2026-10-10','2026-10-11'])).toBe(80);
});
test('API parity: zero-day positive tier2 applies only on an all-holiday age-zero interval',()=>{
 const rule={dayPay:14,disPercent:20,dayPay2:0,disPercent2:80};
 expect(compoundDiscountPercent(rule,'2026-10-05','2026-10-05',['2026-10-05'])).toBe(80);
 expect(compoundDiscountPercent(rule,'2026-10-05','2026-10-06',['2026-10-05'])).toBe(20);
});
