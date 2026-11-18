import {CouponReceiptViewMaintenance} from '../src/components/maintenances/CouponReceiptViewMaintenance';
import {MBillReceiptViewMaintenance} from '../src/components/maintenances/MBillReceiptViewMaintenance';
// The old irreversible AN-only cleanup button is superseded by recoverable all-type removal.
import Maintenance from '../src/components/maintenances/ReceiptMaintenance';
import {OpReceiptViewMaintenance} from '../src/components/maintenances/OpReceiptViewMaintenance';
import {PaReceiptViewMaintenance} from '../src/components/maintenances/PaReceiptViewMaintenance';
import {memoryRealm} from '../test-support/memoryRealm';
import {Alert} from 'react-native';
let mockDatabase;
jest.mock('../src/realm',()=>({objects:name=>mockDatabase.objects(name),objectForPrimaryKey:(...a)=>mockDatabase.objectForPrimaryKey(...a),write:fn=>mockDatabase.write(fn),delete:value=>mockDatabase.delete(value),create:(...a)=>mockDatabase.create(...a)}));
jest.mock('mobx-react',()=>({inject:()=>target=>target,observer:target=>target}));
function setup(level=0){mockDatabase=memoryRealm();mockDatabase.tables.LegacyPostingOutbox=[];
 const item={id:'AN1|0',noticeNo:'TESTAN'},base={receiptNo:'AN1',overdue:false,status:'pending',receiptDate:new Date(),postingPayload:'IMMUTABLE',items:[item]};
 mockDatabase.tables.AdviceReceiptHeader=[base];mockDatabase.tables.AdviceReceiptItem=[item];
 const op={opNo:'TESTOP'};mockDatabase.tables.OpReceiptHeader=[{receiptNo:'OP1',receiptDate:new Date(),items:[op]}];mockDatabase.tables.OpReceiptItem=[op];
 const view=new Maintenance({authStore:{level,userName:'ADMIN'}});view.setState=update=>Object.assign(view.state,update);return view;
}
beforeEach(()=>jest.spyOn(Alert,'alert').mockImplementation(()=>{}));afterEach(()=>jest.restoreAllMocks());
test('bulk OP/AN delete is review-only until explicit confirmation, warns unposted/Office consequences, retains restore evidence',()=>{
 const view=setup(),before=JSON.stringify(mockDatabase.tables);view.render();view.deleteOpReceipts();
 const [title,message,buttons]=Alert.alert.mock.calls[0];expect(title).toBe('Remove local receipts?');expect(message).toContain('Unposted payments will NOT be sent');expect(message).toContain('does not cancel');expect(buttons[0].style).toBe('cancel');expect(JSON.stringify(mockDatabase.tables)).toBe(before);
 buttons[1].onPress();expect(mockDatabase.objects('OpReceiptHeader')).toHaveLength(0);expect(mockDatabase.objects('AdviceReceiptHeader')).toHaveLength(0);expect(mockDatabase.objects('ReceiptRemovalArchive')).toHaveLength(2);expect(view.state.opReceiptCount).toBe(0);expect(view.state.removedReceipts).toHaveLength(2);
});
test('old confirmation is rejected after changes or upload starts',()=>{
 const view=setup();view.deleteOpReceipts();const confirm=Alert.alert.mock.calls[0][2][1].onPress;mockDatabase.tables.LegacyPostingOutbox=[{id:'pending',payload:'snapshot'}];confirm();expect(mockDatabase.objects('OpReceiptHeader')).toHaveLength(1);expect(mockDatabase.objects('ReceiptRemovalArchive')).toHaveLength(0);
});
test('permission checked both on review and confirmation',()=>{let view=setup(1);view.deleteOpReceipts();expect(Alert.alert.mock.calls[0][0]).toBe('Receipts not removed');view=setup();view.deleteOpReceipts();const confirm=Alert.alert.mock.calls[1][2][1].onPress;view.props.authStore.level=1;confirm();expect(mockDatabase.objects('AdviceReceiptHeader')).toHaveLength(1);});
test('OP row delete uses source kind not shared receipt number, refreshes view, cancel changes nothing',()=>{
 setup();mockDatabase.tables.OpReceiptHeader[0].receiptNo='AN1';const view=new OpReceiptViewMaintenance({authStore:{level:0,userName:'ADMIN'}});view.setState=jest.fn();view.removeRow({rowKey:'an:AN1',receiptNo:'AN1'});expect(mockDatabase.objects('AdviceReceiptHeader')).toHaveLength(1);Alert.alert.mock.calls[0][2][1].onPress();expect(mockDatabase.objects('AdviceReceiptHeader')).toHaveLength(0);expect(mockDatabase.objects('OpReceiptHeader')).toHaveLength(1);expect(view.setState).toHaveBeenCalled();
});
test('PA overdue AN row deletes exact AN only, no PA collision deletion',()=>{
 setup();mockDatabase.tables.AdviceReceiptHeader[0].overdue=true;mockDatabase.tables.PaReceiptHeader=[{receiptNo:'AN1',items:[],lines:[],status:'pending'}];const view=new PaReceiptViewMaintenance({authStore:{level:0,userName:'ADMIN'}});view.setState=jest.fn();view.removeRow({rowKey:'an:AN1',receiptNo:'AN1'});Alert.alert.mock.calls[0][2][1].onPress();expect(mockDatabase.objects('AdviceReceiptHeader')).toHaveLength(0);expect(mockDatabase.objects('PaReceiptHeader')).toHaveLength(1);
});

test.each([[CouponReceiptViewMaintenance,'CouponReceiptHeader','CouponReceiptItem',{startingCouponNo:'C001',endingCouponNo:'C002'}],[MBillReceiptViewMaintenance,'MBillReceiptHeader','MBillReceiptItem',{mBillNo:'B1',city:'BTU',amount:1}]])('receipt view renders a row action and confirms deletion for all remaining types', (Screen,header,details,item)=>{
 setup();const row={receiptNo:'OTHER',receiptDate:new Date(),items:[item]};mockDatabase.tables[header]=[row];mockDatabase.tables[details]=[item];
 const view=new Screen({authStore:{level:0,userName:'ADMIN'}});view.setState=jest.fn();expect(()=>view.renderRow(row)).not.toThrow();view.removeRow(row);expect(mockDatabase.objects(header)).toHaveLength(1);Alert.alert.mock.calls[0][2][1].onPress();expect(mockDatabase.objects(header)).toHaveLength(0);expect(view.setState).toHaveBeenCalled();
});
