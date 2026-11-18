import { types } from 'mobx-state-tree';
import realm from '../realm';

const generalProfile = realm.objects('GeneralProfile');

let GeneralStore = types.model({
  companyName: types.maybe(types.string),
  shortName: types.maybe(types.string),
  Address1: types.maybe(types.string),
  Address2: types.maybe(types.string),
  Address3: types.maybe(types.string),
  Telephone1: types.maybe(types.string),
  Telephone2: types.maybe(types.string),
  Telephone3: types.maybe(types.string),
  Telephone4: types.maybe(types.string),
  Fax1: types.maybe(types.string),
  Fax2: types.maybe(types.string),
  Email1: types.maybe(types.string),
  Email2: types.maybe(types.string),
  Email3: types.maybe(types.string),
  Website: types.maybe(types.string),
  Currency: types.maybe(types.string),
  CompanyNo: types.maybe(types.string),
  GstRegNo: types.maybe(types.string),
  TaxCode: types.maybe(types.string),
  Tax: types.optional(types.number, 0),
  PondokId: types.maybe(types.string),
  PondokName: types.maybe(types.string),
  PondokCity: types.maybe(types.string),
  PondokArea: types.maybe(types.string),
  CouponReceiptPrefix: types.maybe(types.string),
  OpReceiptPrefix: types.maybe(types.string),
  PaReceiptPrefix: types.maybe(types.string),
  MBillReceiptPrefix: types.maybe(types.string),
  CouponReceiptNo: types.optional(types.number, 0),
  OpReceiptNo: types.optional(types.number, 0),
  PaReceiptNo: types.optional(types.number, 0),
  MBillReceiptNo: types.optional(types.number, 0),
  printerAddress: types.maybe(types.string)
})
  .actions(self => ({
    setItem(key, value) {
      self[key] = value;
    },
    reloadFromStorage() {
      const generalProfile2 = realm.objects('GeneralProfile')[0];
      Object.keys(generalProfile2).map(key => {
        self[key] = generalProfile2[key];
      });
    }
  })
  );

if (generalProfile.length > 0) {
  GeneralStore = GeneralStore.create(JSON.parse(JSON.stringify(generalProfile[0])));
} else {
  GeneralStore = GeneralStore.create();
}


export default GeneralStore;

