import {memoryRealm} from '../test-support/memoryRealm';
import {adviceItem} from '../src/advice/collection';
import {saveAdviceReceipt} from '../src/advice/storage';
import {postAdviceBatch} from '../src/advice/payload';
const rules={calendarDays:7,overdueFee:20,taxEnabled:true,windowIncludesCollectionDate:true,rounding:'nearest_0.05_on_notice_net_and_tax',collectionPolicyVersion:3,feeBasis:'receipt',baseAmount:0.8,excessCharges:1,taxPercent:6};
const RealDate=Date;
test('POS immutable AN payloads match the dev contract and acknowledged synthetic queue rows clear',async()=>{
 global.Date=class extends RealDate {constructor(...args){super(...(args.length?args:['2026-10-27T04:00:00Z']));}static now(){return new RealDate('2026-10-27T04:00:00Z').getTime();}};
 try{
  const payloads={};
  for(const overdue of [false,true]){
   const db=memoryRealm();db.tables.AdviceRules[0].json=JSON.stringify({protocolVersion:1,configured:true,rules});db.tables.HolidayCalendar[0].json=JSON.stringify(['2026-10-24','2026-10-25']);
   const items=['QAAN1','QAAN2'].map(noticeNo=>adviceItem({noticeNo,noticeDate:overdue?'2026-10-18':'2026-10-19',city:'Bintulu',carNo:'QATEST'},rules,overdue));
   const saved=saveAdviceReceipt(db,{items,overdue,rules,userName:'QA'});const original=db.objects('AdviceReceiptHeader')[0].postingPayload;
   const http={post:jest.fn(async(url,body)=>{expect(url).toBe('https://dev-bdap-csparkoffice.codesquad.ninja/api/pondok-advice-posting');payloads[overdue?'overdue':'normal']=body.adviceReceipts[0];return{data:{protocolVersion:1,receipts:[{receiptNo:saved.receiptNo,status:'accepted',staged:true,errors:[]}]}};})};
   expect(await postAdviceBatch(db,http,'https://dev-bdap-csparkoffice.codesquad.ninja',new Date('2026-10-27T00:00:00+08:00'),new Date('2026-10-28T00:00:00+08:00'))).toEqual({sent:1,retained:0});
   expect(db.objects('AdviceReceiptHeader')).toHaveLength(0);expect(JSON.stringify(payloads[overdue?'overdue':'normal'])).toBe(original);expect(payloads[overdue?'overdue':'normal'].totalAmount).toBe(overdue?'23.70':'3.70');
  }
  if(process.env.CSPARK_AN_CONTRACT)require('fs').writeFileSync(process.env.CSPARK_AN_CONTRACT,JSON.stringify(payloads,null,2));
 }finally{global.Date=RealDate;}
});
