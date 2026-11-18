// Optional recorded vehicle metadata accompanies normal OPN receipts only.
import {hasOpnVehicle} from './opnVehicle';
// Preserve the original stored identity, dates and financial values verbatim.
export function legacyOpReceiptPayload(receipt) {
  return {receiptNo:receipt.receiptNo,userName:receipt.userName,receiptDate:receipt.receiptDate,
    pondokId:receipt.pondokId,city:receipt.city,reminderNo:receipt.reminderNo,
    ...(hasOpnVehicle(receipt.carNo) ? {carNo:receipt.carNo} : {}),
    items:Array.from(receipt.items).map(item=>({opNo:item.opNo,opDate:item.opDate,
      amount:item.amount,taxAmount:item.taxAmount,tax:item.tax,
      ...(hasOpnVehicle(item.carNo) ? {carNo:item.carNo} : {})}))};
}
