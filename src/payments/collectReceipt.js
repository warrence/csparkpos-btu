import {Alert} from 'react-native';
import {nextReceiptNumber} from './receiptNumbers';
import {paymentTender, paymentSavedMessage, paymentChangeMessage} from './tender';

export async function reprintSavedReceipt(screen, kind, receiptNo) {
  if (screen._reprinting) return;
  screen._reprinting = true;
  try { return await screen.state.printReceipt.print(kind, receiptNo); }
  finally { screen._reprinting = false; }
}

function offerReprint(screen, kind, receiptNo, message, validateReprint) {
  screen.setState({reprintReceiptNo: receiptNo});
  Alert.alert(message, 'Reprint the saved receipt without collecting payment again?', [
    {text: 'Cancel', style: 'cancel'},
    {text: 'Reprint', onPress: () => Promise.resolve().then(() => {
      if (validateReprint) validateReprint();
      return reprintSavedReceipt(screen, kind, receiptNo);
    }).catch(error => Alert.alert(`Unable to reprint receipt ${receiptNo}: ${error.message}`))}
  ]);
}

// All database changes commit before a printer call. A printer failure must never
// leave the basket available for another collection of the same payment.
export async function collectReceipt(screen, database, overdue, kind, create) {
  if (screen._saving) return;
  screen._saving = true;
  screen.setState({saving: true});
  let saved, tender;
  try {
    if (!screen.state.data.length) throw new Error('Purchase Item List is empty!');
    const total = Number(screen.state.total);
    if (!Number.isFinite(total) || total <= 0) throw new Error('Enter a valid payment total.');
    tender = paymentTender(screen.state.amountReceived, total);
    let candidate;
    database.write(() => {
      const profile = database.objects('GeneralProfile')[0];
      const allocation = nextReceiptNumber(database, profile, overdue);
      create(allocation.receiptNo, profile);
      profile[allocation.counter] = allocation.next;
      candidate = allocation.receiptNo;
    });
    saved = candidate;
    screen.setState({reprintReceiptNo: saved});
    screen.clearForm();
    await screen.state.printReceipt.print(kind, saved);
    Alert.alert(paymentSavedMessage(saved, tender.change));
    return saved;
  } catch (error) {
    if (saved) {
      offerReprint(screen, kind, saved, `Receipt ${saved} is saved. Printing failed; use Reprint Receipt. Do not collect it again.${tender.change == null ? '' : ` ${paymentChangeMessage(tender.change)}.`}`);
    } else if (error.receiptNo) {
      offerReprint(screen, error.printKind, error.receiptNo, error.message, error.validateReprint);
    } else {
      Alert.alert(`Payment was not saved: ${error.message}`);
    }
  } finally {
    screen._saving = false;
    screen.setState({saving: false});
  }
}
