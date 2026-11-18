import {paMaintenanceRows} from '../src/payments/paMaintenance';
import {opMaintenanceRows} from '../src/payments/opMaintenance';
import {memoryRealm} from '../test-support/memoryRealm';
import {Toast} from 'native-base';
beforeEach(()=>jest.spyOn(Toast,'show').mockImplementation(()=>{}));
afterEach(()=>jest.restoreAllMocks());
let mockDatabase;
jest.mock('../src/realm',()=>({objects:name=>mockDatabase.objects(name),objectForPrimaryKey:(...args)=>mockDatabase.objectForPrimaryKey(...args),write:fn=>mockDatabase.write(fn),delete:rows=>mockDatabase.delete(rows)}));
jest.mock('mobx-react',()=>({inject:()=>target=>target,observer:target=>target}));
const Maintenance=require('../src/components/maintenances/ReceiptMaintenance').default;
function seed(){mockDatabase=memoryRealm();const base={receiptNo:'PA-P1-1',pondokId:'P1',userName:'FIXTURE',receiptDate:new Date('2026-10-19T04:00:00Z')};
 mockDatabase.tables.PaReceiptHeader=[{...base,paType:'O',items:[{paNo:'QO1019001'}]}];mockDatabase.tables.PaReceiptItem=mockDatabase.tables.PaReceiptHeader[0].items;
 mockDatabase.tables.AdviceReceiptHeader=[{...base,overdue:true,status:'pending',postingPayload:'IMMUTABLE',items:[{noticeNo:'QA1019001'}]},
 {...base,receiptNo:'PA-P1-2',overdue:true,status:'posted',receiptDate:new Date('2026-10-19T05:00:00Z'),postingPayload:'ARCHIVE',items:[{noticeNo:'QA1019002'}]},
 {...base,receiptNo:'OP-P1-3',overdue:false,status:'pending',items:[{noticeNo:'CURRENT'}]}];
 mockDatabase.tables.AdviceReceiptItem=mockDatabase.tables.AdviceReceiptHeader.flatMap(row=>row.items);return mockDatabase;}
test('display union includes overdue pending/uploaded AN and legacy PA with distinct source identity, date sort and notice mapping',()=>{
 const db=seed(),before=JSON.stringify(db.tables),rows=paMaintenanceRows(db);
 expect(rows.map(row=>row.rowKey)).toEqual(['an:PA-P1-2','an:PA-P1-1','pa:PA-P1-1']);expect(rows[0].status).toBe('Uploaded (not settlement)');expect(rows[1]).toMatchObject({source:'AN',paType:'AN overdue',status:'pending',items:[{paNo:'QA1019001'}]});
 expect(JSON.stringify(db.tables)).toBe(before);
});


function currentSeed(){const db=seed();const base={receiptNo:'OP-P1-3',pondokId:'P1',userName:'FIXTURE',city:'Bintulu',receiptDate:new Date('2026-10-19T06:00:00Z')};
 db.tables.OpReceiptHeader=[{...base,items:[{opNo:'OPCURRENT'}]}];db.tables.OpReceiptItem=db.tables.OpReceiptHeader[0].items;
 db.tables.AdviceReceiptHeader.find(row=>row.overdue===false).city='Bintulu';
 db.tables.AdviceReceiptHeader.push({...base,receiptNo:'OP-P1-4',overdue:false,status:'posted',postingPayload:'CURRENT_ARCHIVE',items:[{noticeNo:'ANARCHIVE'}]});
 return db;}
test('OP union shows pending/uploaded current AN only, preserves same-number legacy OP, and has no AN overlap with PA',()=>{
 const db=currentSeed(),before=JSON.stringify(db.tables),rows=opMaintenanceRows(db),pa=paMaintenanceRows(db);
 expect(rows.map(row=>row.rowKey)).toEqual(['an:OP-P1-4','op:OP-P1-3','an:OP-P1-3']);
 expect(rows[0]).toMatchObject({source:'AN current',status:'Uploaded (not settlement)',items:[{opNo:'ANARCHIVE'}]});
 expect(rows[2]).toMatchObject({status:'pending',items:[{opNo:'CURRENT'}]});
 const paAnKeys=pa.filter(row=>row.source==='AN').map(row=>row.rowKey);
 expect(rows.filter(row=>row.source==='AN current').every(row=>!paAnKeys.includes(row.rowKey))).toBe(true);
 expect(JSON.stringify(db.tables)).toBe(before);
});

test('maintenance labels describe all local receipt categories and recoverable removal',()=>{
 currentSeed();const view=new Maintenance({authStore:{level:0}});
 function strings(node){if(typeof node==='string')return [node];if(!node)return [];if(Array.isArray(node))return node.flatMap(strings);return strings(node.props&&node.props.children);}
 const labels=strings(view.render());expect(labels).toContain('PA Receipt / Overdue AN / Overdue OP');expect(labels).toContain('OP / AN Receipt');
 expect(labels).toContain('Delete all OP / AN receipts');expect(labels).toContain('Delete all PA / overdue receipts');
});


