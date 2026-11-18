// These responses were captured from the real Office route against isolated synthetic SQLite.
import wire from '../test-support/fixtures/safe-posting-wire.json';
import accepted from '../test-support/fixtures/safe-posting-office-ack.json';
import replay from '../test-support/fixtures/safe-posting-office-retry-ack.json';
import {completePostingAcknowledgment,legacyNoticeCounts,postLegacyBatch,POSTING_PROTOCOL} from '../src/payments/safePosting';
import {memoryRealm,materializeReceiptLinks} from '../test-support/memoryRealm';

test.each([[accepted,0],[replay,6]])('actual Office acknowledgment validates exact POS wire and accurate count', (response,prior)=>{
 expect(completePostingAcknowledgment(response,wire)).toBe(true);
 expect(legacyNoticeCounts(wire,response)).toEqual({op:6,pa:0,couponReceipts:0,alreadyReceived:prior,receipts:3});
});

test('cold outbox replay consumes actual Office already_received response and clears exactly the preserved queue',async()=>{
 const db=memoryRealm();db.tables.OpReceiptHeader=wire.opReceipts.map(row=>({...row,receiptDate:new Date(row.receiptDate),items:row.items.map(item=>({...item,opDate:new Date(item.opDate)}))}));
 db.tables.LegacyPostingOutbox=[{id:'pending',dateKey:'06/10/2026',requestId:wire.requestId,payload:JSON.stringify(wire),createdAt:new Date()}];
 const before=JSON.stringify(db.tables.GeneralProfile);
 const http={get:jest.fn().mockResolvedValue({data:{protocol:POSTING_PROTOCOL,ready:true}}),post:jest.fn(async(url,body)=>{expect(body).toEqual(wire);return {data:replay};})};
 materializeReceiptLinks(db);
 const result=await postLegacyBatch(db,http,'https://fixture.invalid',new Date('2026-10-05T16:00:00Z'),new Date('2026-10-06T16:00:00Z'),'06/10/2026');
 expect(result).toMatchObject({sent:3,pending:false,counts:{op:6,alreadyReceived:6,receipts:3}});expect(db.tables.OpReceiptHeader).toHaveLength(0);expect(db.tables.LegacyPostingOutbox).toHaveLength(0);expect(JSON.stringify(db.tables.GeneralProfile)).toBe(before);
});
