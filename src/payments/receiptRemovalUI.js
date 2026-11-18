import {Alert} from 'react-native';
import {planReceiptRemoval,removeReviewedReceipts,planReceiptRestore,restoreReviewedReceipt} from './receiptRemoval';
function admin(view) {if(!view.props.authStore||view.props.authStore.level!=0)throw Error('Administrator access is required.');}
export function reviewReceiptRemoval(view,database,selection,onDone) {
  try {
    admin(view);const plan=planReceiptRemoval(database,selection);
    const list=plan.receipts.map(row=>`${row.kind.toUpperCase()} ${row.receiptNo} — ${row.status}`).join('\n');
    Alert.alert('Remove local receipts?',`${list}\n\nRemove ${plan.receipts.length} receipt(s) from this device’s active view and posting queue? Unposted payments will NOT be sent to Office. This does not cancel, refund or delete any Office payment. An old pending receipt may already have reached Office.\n\nA recoverable local archive and duplicate evidence will be retained. Totals/reprinting change until restored. Counters are not reset.`,[
      {text:'Cancel',style:'cancel'},
      {text:`Remove ${plan.receipts.length} receipt(s)`,style:'destructive',onPress:()=>{try{
        admin(view);removeReviewedReceipts(database,plan,view.props.authStore.userName||'administrator');onDone();
      }catch(error){Alert.alert('Receipts not removed',error.message);}}}
    ],{cancelable:true});
  }catch(error){Alert.alert('Receipts not removed',error.message);}
}
export function reviewReceiptRestore(view,database,id,onDone) {
  try {admin(view);const plan=planReceiptRestore(database,id);
    Alert.alert('Restore local receipt?',`Restore ${plan.kind.toUpperCase()} ${plan.receiptNo} to its original state? Pending receipts will return to the posting queue. Confirm any old uncertain payment with Office before posting. No Office payment or counter is changed.`,[
      {text:'Cancel',style:'cancel'}, {text:'Restore',onPress:()=>{try{admin(view);restoreReviewedReceipt(database,plan);onDone();}catch(error){Alert.alert('Receipt not restored',error.message);}}}
    ],{cancelable:true});
  }catch(error){Alert.alert('Receipt not restored',error.message);}
}
