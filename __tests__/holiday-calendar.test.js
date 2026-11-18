import {applicableDays, holidayDates, kuchingDate, readHolidayCalendar, holidayCalendarLabel} from '../src/payments/holidayCalendar';
import {calendarIsOverdue, calendarWindowDates} from '../src/payments/calendarWindow';
import {compoundDiscountPercent} from '../src/payments/compoundDiscount';
import {adviceIsOverdue} from '../src/advice/rules';
import {memoryRealm, RULES} from '../test-support/memoryRealm';
import {saveAdviceReceipt} from '../src/advice/storage';
import {adviceItem} from '../src/advice/collection';
let mockDatabase;
jest.mock('../src/realm', () => ({objects: (...args) => mockDatabase.objects(...args),
  write: cb => mockDatabase.write(cb), delete: rows => mockDatabase.delete(rows),
  create: (...args) => mockDatabase.create(...args)}));
jest.mock('axios', () => ({get: jest.fn()}));
jest.mock('../src/global', () => ({SERVER_URL: 'http://fixture.invalid'}));
jest.mock('bugsnag-react-native', () => ({Client: class {notify() {}}}));
const LoadHoliday = require('../src/components/load-data/LoadHoliday').default;
const axios = require('axios');
beforeEach(() => {mockDatabase = memoryRealm(); axios.get.mockReset();});

test.each([
 ['2026-10-01','2026-10-04',[],4],
 ['2026-10-01','2026-10-04',['2026-10-02'],3],
 ['2026-10-01','2026-10-04',['2026-10-04'],3],
 ['2026-10-01','2026-10-04',['2026-10-01'],3],
 ['2026-10-01','2026-10-04',['2026-10-02','2026-10-03'],2],
 ['2026-12-30','2027-01-02',['2026-12-31','2027-01-01'],2],
 ['2024-02-28','2024-03-01',['2024-02-29'],2],
 ['2026-10-03','2026-10-04',[],2], // Unlisted Saturday/Sunday count.
 ['2026-10-04','2026-10-04',['2026-10-04'],0],
])('inclusive age %s to %s excludes %j', (issue, paid, holidays, age) => {
 expect(applicableDays(issue,paid,holidays)).toBe(age);
 expect(calendarIsOverdue(issue,Math.max(1,age),paid,holidays)).toBe(false);
 if(age>1)expect(adviceIsOverdue(issue,{calendarDays:age-1},paid,holidays)).toBe(true);
});
test('interval helper excludes configured dates at either boundary',()=>{
 expect(applicableDays('2026-10-01','2026-10-02',['2026-10-01'],false)).toBe(1);
 expect(applicableDays('2026-10-01','2026-10-02',['2026-10-02'],false)).toBe(0);
});
test('confirmed inclusive issue-day boundaries across expiry and both discount tiers',()=>{
 const rule={dayPay:7,disPercent:10,dayPay2:2,disPercent2:50};
 for(let age=0;age<10;age++) {
  const issue=kuchingDate('2026-10-10').subtract(age,'days').format('YYYY-MM-DD');
  expect(calendarIsOverdue(issue,7,'2026-10-10',[])).toBe(age+1>7);
  expect(compoundDiscountPercent(rule,issue,'2026-10-10',[])).toBe(age+1<=2?50:age+1<=7?10:0);
 }
 expect(compoundDiscountPercent(rule,'2026-10-08','2026-10-10',['2026-10-09'])).toBe(50);
});
test('backward window includes holiday issue dates at oldest boundary, with classifier parity',()=>{
 const holidays=['2026-10-01','2026-10-03','2026-10-04'];
 const dates=calendarWindowDates(2,'2026-10-05',holidays).map(d=>d.format('YYYY-MM-DD'));
 expect(dates).toEqual(['2026-10-05','2026-10-04','2026-10-03','2026-10-02','2026-10-01']);
 dates.forEach(date=>expect(calendarIsOverdue(date,2,'2026-10-05',holidays)).toBe(false));
 expect(calendarIsOverdue('2026-09-30',2,'2026-10-05',holidays)).toBe(true);
});
test('Kuching midnight is explicit even on a UTC device',()=>{
 expect(kuchingDate(new Date('2026-10-17T15:59:59Z')).format('YYYY-MM-DD')).toBe('2026-10-17');
 expect(kuchingDate(new Date('2026-10-17T16:00:00Z')).format('YYYY-MM-DD')).toBe('2026-10-18');
 expect(()=>applicableDays('2026-10-19','2026-10-18',[])).toThrow('future');
});
test('active holiday dates only, duplicates once, malformed responses rejected',()=>{
 expect(holidayDates([{HolidayDate:'2026-10-01'},{HolidayDate:'2026-10-01'}, {HolidayDate:'2026-10-02',deleted_at:'2026-10-03'}])).toEqual(['2026-10-01']);
 for(const rows of [null,{},[{HolidayDate:'2026-02-30'}]])expect(()=>holidayDates(rows)).toThrow();
});
test('missing cache blocks collection; a successful empty response is known-empty',async()=>{
 mockDatabase.tables.HolidayCalendar=[];
 expect(()=>readHolidayCalendar(mockDatabase)).toThrow('Load holidays');
 axios.get.mockResolvedValue({data:[]});expect(await LoadHoliday()).toBe(true);
 expect(readHolidayCalendar(mockDatabase).dates).toEqual([]);
});
test('loader replaces dates and tombstones atomically, next read sees edits/deletes',async()=>{
 axios.get.mockResolvedValue({data:[{HolidayDate:'2026-10-01',Holiday:'Fixture'},{HolidayDate:'2026-10-02',deleted_at:'2026-10-03'}]});
 expect(await LoadHoliday()).toBe(true);expect(readHolidayCalendar(mockDatabase).dates).toEqual(['2026-10-01']);
 expect(mockDatabase.objects('Holiday')).toHaveLength(1);
 axios.get.mockResolvedValue({data:[{HolidayDate:'2026-10-03',Holiday:'Edited'}]});
 expect(await LoadHoliday()).toBe(true);expect(readHolidayCalendar(mockDatabase).dates).toEqual(['2026-10-03']);
});
test.each(['network','malformed','write'])('failed %s refresh preserves last successful snapshot',async failure=>{
 const before=JSON.stringify(mockDatabase.tables);
 if(failure==='network')axios.get.mockRejectedValue(new Error('Synthetic offline'));
 else axios.get.mockResolvedValue({data:failure==='malformed'?[{HolidayDate:'invalid'}]:[{HolidayDate:'2026-10-01'}]});
 if(failure==='write')mockDatabase.create=()=>{throw new Error('Synthetic rollback');};
 expect(await LoadHoliday()).toBe(false);expect(JSON.stringify(mockDatabase.tables)).toBe(before);
});

test('AN save rechecks a changed holiday boundary and preserves saved receipts',()=>{
 const rules={...RULES,calendarDays:2},now=new Date('2026-10-10T04:00:00Z');
 const state={noticeNo:'ANHOLIDAY1',noticeDate:'2026-10-08',city:'BTU',carNo:'TESTCAR',couponNo:'QA',baseAmount:'0.80',excessCharge:'1.00',taxRate:'6',taxAmount:'0.05'};
 const old={receiptNo:'OLD',postingPayload:'unchanged',rulesSnapshot:'unchanged'};
 mockDatabase.tables.AdviceReceiptHeader=[old];
 mockDatabase.tables.HolidayCalendar[0].json=JSON.stringify(['2026-10-09']);
 const late=adviceItem(state,rules,true);
 expect(()=>saveAdviceReceipt(mockDatabase,{items:[late],overdue:true,userName:'FIXTURE',rules,now})).toThrow('window changed');
 expect(mockDatabase.objects('AdviceReceiptHeader')).toEqual([old]);
 const current=adviceItem(state,rules,false);
 expect(saveAdviceReceipt(mockDatabase,{items:[current],overdue:false,userName:'FIXTURE',rules,now}).receiptNo).toBe('OP-P1-41');
 expect(mockDatabase.objects('AdviceReceiptHeader')[0]).toEqual(old);
});
test('AN cannot save with an absent holiday snapshot',()=>{
 const state={noticeNo:'ANHOLIDAY1',noticeDate:'2026-10-10',city:'BTU',carNo:'TESTCAR',couponNo:'',baseAmount:'0.80',excessCharge:'1.00',taxRate:'6',taxAmount:'0.05'};
 const item=adviceItem(state,RULES,false);mockDatabase.tables.HolidayCalendar=[];
 expect(()=>saveAdviceReceipt(mockDatabase,{items:[item],overdue:false,userName:'FIXTURE',rules:RULES,now:new Date('2026-10-10T04:00:00Z')})).toThrow('Load holidays');
 expect(mockDatabase.objects('AdviceReceiptHeader')).toHaveLength(0);
});

test('office revision and generation time are cached, with a readable download date',async()=>{
 const revision='a'.repeat(64);
 axios.get.mockResolvedValue({data:[{HolidayDate:'2026-10-01'}],headers:{'x-holiday-revision':revision,'x-holiday-generated-at':'2026-10-10T12:30:00+08:00','x-holiday-timezone':'Asia/Kuching'}});
 expect(await LoadHoliday()).toBe(true);expect(readHolidayCalendar(mockDatabase).revision).toBe(revision);
 expect(readHolidayCalendar(mockDatabase).serverGeneratedAt.toISOString()).toBe('2026-10-10T04:30:00.000Z');
 mockDatabase.tables.HolidayCalendar[0].loadedAt=new Date('2026-10-11T04:31:00Z');
 expect(holidayCalendarLabel(mockDatabase)).toBe('Last holiday download: 11 Oct 2026, 12:31 (+08)');
});
test.each([{'x-holiday-revision':'bad'},{'x-holiday-generated-at':'invalid'},{'x-holiday-timezone':'UTC'}])('invalid metadata %j cannot replace the last good snapshot',async headers=>{
 const before=JSON.stringify(mockDatabase.tables);axios.get.mockResolvedValue({data:[],headers});
 expect(await LoadHoliday()).toBe(false);expect(JSON.stringify(mockDatabase.tables)).toBe(before);
});
test('legacy array-only endpoint remains usable, with explicitly unknown server revision',async()=>{
 axios.get.mockResolvedValue({data:[]});expect(await LoadHoliday()).toBe(true);
 expect(readHolidayCalendar(mockDatabase).revision).toBeNull();expect(readHolidayCalendar(mockDatabase).serverGeneratedAt).toBeNull();
});

test('populated pre-upgrade holiday cache remains usable offline without an invented age limit',()=>{
 mockDatabase.tables.HolidayCalendar=[];
 mockDatabase.tables.Holiday=[{holidayDate:new Date('2026-10-01T00:00:00Z'),holidayName:'Legacy cached date'}];
 expect(readHolidayCalendar(mockDatabase)).toEqual({dates:['2026-10-01'],loadedAt:null,revision:null,serverGeneratedAt:null,legacy:true});
 expect(holidayCalendarLabel(mockDatabase)).toContain('download time unknown');
 expect(calendarIsOverdue('2026-10-01',1,'2026-10-02',readHolidayCalendar(mockDatabase).dates)).toBe(false);
});

test('confirmed 14-day discount counts 1 October as day 1 and only listed dates extend it',()=>{
 const rule={dayPay:14,disPercent:50,dayPay2:0,disPercent2:0};
 expect(compoundDiscountPercent(rule,'2026-10-01','2026-10-14',[])).toBe(50);
 expect(compoundDiscountPercent(rule,'2026-10-01','2026-10-15',[])).toBe(0);
 expect(compoundDiscountPercent(rule,'2026-10-01','2026-10-15',['2026-10-14'])).toBe(50);
});

test.each([
 ['2026-10-05',['2026-10-05'],0],
 ['2026-10-06',['2026-10-05'],1],
 ['2026-10-07',['2026-10-05'],2],
 ['2026-10-07',['2026-10-05','2026-10-06'],1],
])('holiday-issued Monday reaches applicable day %s with %j', (paid,holidays,age)=>{
 const rule={dayPay:1,disPercent:50,dayPay2:0,disPercent2:0};
 expect(applicableDays('2026-10-05',paid,holidays)).toBe(age);
 expect(calendarIsOverdue('2026-10-05',1,paid,holidays)).toBe(age>1);
 expect(adviceIsOverdue('2026-10-05',{calendarDays:1},paid,holidays)).toBe(age>1);
 expect(compoundDiscountPercent(rule,'2026-10-05',paid,holidays)).toBe(age<=1?50:0);
});
test('ordinary Tuesday is day 1 and holiday Monday remains inside the one-day payable window',()=>{
 expect(applicableDays('2026-10-06','2026-10-06',[])).toBe(1);
 expect(calendarWindowDates(1,'2026-10-06',['2026-10-05']).map(d=>d.format('YYYY-MM-DD'))).toEqual(['2026-10-06','2026-10-05']);
});

test.each([
 ['2026-10-07',1,50],['2026-10-08',2,50],['2026-10-09',3,50],
 ['2026-10-10',3,50],['2026-10-11',3,50],['2026-10-12',4,0],
])('Wednesday three-day 50 percent discount on %s has age %i and discount %i', (paid,age,percent)=>{
 const holidays=['2026-10-10','2026-10-11'];
 const rule={dayPay:3,disPercent:50,dayPay2:0,disPercent2:0};
 expect(applicableDays('2026-10-07',paid,holidays)).toBe(age);
 expect(compoundDiscountPercent(rule,'2026-10-07',paid,holidays)).toBe(percent);
});
test('an unlisted weekend date counts normally in the Wednesday discount example',()=>{
 const rule={dayPay:3,disPercent:50,dayPay2:0,disPercent2:0};
 expect(applicableDays('2026-10-07','2026-10-10',['2026-10-11'])).toBe(4);
 expect(compoundDiscountPercent(rule,'2026-10-07','2026-10-10',['2026-10-11'])).toBe(0);
 expect(applicableDays('2026-10-07','2026-10-11',['2026-10-10'])).toBe(4);
 expect(compoundDiscountPercent(rule,'2026-10-07','2026-10-11',['2026-10-10'])).toBe(0);
});

test('never-downloaded calendar status is explicit',()=>{mockDatabase.tables.HolidayCalendar=[];mockDatabase.tables.Holiday=[];expect(holidayCalendarLabel(mockDatabase)).toBe('No usable holiday download. Load holidays before collecting.');});
