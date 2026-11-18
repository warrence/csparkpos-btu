import {Alert} from 'react-native';
import {Actions} from "react-native-router-flux";
import realm from "./realm";
import moment from 'moment';
import {readHolidayCalendar} from './payments/holidayCalendar';
import {calendarWindowDates} from './payments/calendarWindow';

export function showConnectionErrorAlert() {
  Alert.alert(
    'Server Connection Error!',
    'Please make sure you are connected to Wifi or your 3g/4g is working.', [
      { text: 'OK', onPress: () => Actions.pop() }
    ]);
}

export function resetDatabase() {
  realm.write(() => {
    realm.delete(realm.objects('GeneralProfile'));
    realm.delete(realm.objects('City'));
    realm.delete(realm.objects('Holiday'));
    realm.delete(realm.objects('HolidayCalendar'));
    realm.delete(realm.objects('Pass'));
    realm.delete(realm.objects('OpTable'));
    realm.delete(realm.objects('Offence'));
    realm.delete(realm.objects('Coupon'));
    realm.delete(realm.objects('CouponReceiptHeader'));
    realm.delete(realm.objects('CouponReceiptItem'));
    realm.delete(realm.objects('OpReceipt'));
    realm.delete(realm.objects('PaReceipt'));
  });
}

export function getOpPayableDate(cityCode, now = new Date()) {
  const city = Array.from(realm.objects('City')).find(row => row.code === cityCode);
  return calendarWindowDates(city && city.opExpiryDay, now, readHolidayCalendar(realm).dates);
}

export function bnmRound(amount){
  let nCent = amount.toFixed(2).slice(-1);

  let nRoundDownDis=0;

  if(nCent !== 0){
    switch(true){
      case (nCent>=8):
        nRoundDownDis=(10-nCent);
        break;
      case (nCent>5 && nCent<8):
        nRoundDownDis=(5-nCent);
        break;
      case (nCent<5 && nCent>2):
        nRoundDownDis=(5-nCent);
        break;
      case (nCent>0 && nCent<3):
        nRoundDownDis=(0-nCent);
        break;
      case (nCent==0):
        nRoundDownDis=0;
        break;
    }
  }

  let final = (amount+(nRoundDownDis/100)).toFixed(2);
  return final;
}
