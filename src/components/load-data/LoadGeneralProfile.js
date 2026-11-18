import axios from 'axios';
import realm from '../../realm';
import { Client } from 'bugsnag-react-native';
import { SERVER_URL } from '../../global';
import {preserveReceiptCounters} from '../../advice/counters';

const bugsnag = new Client();

const LoadGeneralProfile = async (_this) => {
    return await axios.get(`${SERVER_URL}/api/load-data/company`)
      .then(async response => {
        let cityData = null;
        let receiptNoData = null;

        await axios.get(`${SERVER_URL}/api/load-data/pondok/${_this.state.pondok_to_load}`)
          .then(response2 => {
            cityData = response2.data;
          });

        await axios.get(`${SERVER_URL}/api/load-data/receipt-no/${_this.state.pondok_to_load}`)
          .then(response3 => {
            receiptNoData = response3.data;
          });

        const data = response.data;

        const company = {
          companyName: data.Company_name,
          shortName: data.other_name,
          Address1: data.Address1,
          Address2: data.address2,
          Address3: data.address3,
          Telephone1: data.Telephone1,
          Telephone2: data.Telephone2,
          Telephone3: data.Telephone3,
          Telephone4: data.Telephone4,
          Fax1: data.fax1,
          Fax2: data.fax2,
          Email1: data.email1,
          Email2: data.email2,
          Email3: data.email3,
          Website: data.website,
          Currency: data.currency,
          CompanyNo: data.company_number,
          GstRegNo: data.Gst_regno,
          PondokId: cityData.PondokID,
          PondokName: cityData.PondokName,
          PondokCity: cityData.City,
          PondokArea: cityData.Area,
          Tax: data.Tax,
          TaxCode: data.TaxCode,
          CouponReceiptPrefix: receiptNoData.coupon_receipt_prefix,
          OpReceiptPrefix: receiptNoData.op_receipt_prefix,
          PaReceiptPrefix: receiptNoData.pa_receipt_prefix,
          MBillReceiptPrefix: receiptNoData.mb_receipt_prefix || 'MBILL',
          CouponReceiptNo: receiptNoData.coupon_receipt_no,
          OpReceiptNo: receiptNoData.op_receipt_no,
          PaReceiptNo: receiptNoData.pa_receipt_no,
          MBillReceiptNo: receiptNoData.mb_receipt_no || 0,
        };

        try {
          realm.write(() => {
            const preserved = preserveReceiptCounters(realm, company);
            realm.delete(realm.objects('GeneralProfile'));
            realm.create('GeneralProfile', preserved);
          });
        } catch (error) {
          return false;
        }

        return true;
      })
      .catch(error => {
        bugsnag.notify(error);
        return false;
      });
  };

export default LoadGeneralProfile;
