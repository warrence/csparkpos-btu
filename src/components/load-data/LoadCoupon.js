import axios from 'axios';
import realm from '../../realm';
import { Client } from 'bugsnag-react-native';
import { SERVER_URL } from '../../global';
import moment from 'moment';

const bugsnag = new Client();

const LoadPass = async (_this) => {
  return await axios.post(`${SERVER_URL}/api/load-data/issued-coupon`, {
    pondok_id: _this.state.pondok_to_load,
    date_to_load: moment(_this.state.date_to_load).format('YYYY-MM-DD')
  })
    .then(response => {
      const coupons = response.data.map((data) => {
        console.log(data);
        return {
          couponNo: data.Coupon_no,
          couponType: parseInt(data.CouponType),
          issueDate: data.issue_date
        };
      });

      try {
        realm.write(() => {
          //realm.delete(realm.objects('Coupon'));
          coupons.forEach((coupon) => {
            realm.create('Coupon', coupon);
          });
        });
      } catch (error) {
        //console.log(coupons);
        return false;
      }

      return true;
    })
    .catch(error => {
      console.log(error);
      bugsnag.notify(error);
      return false;
    });
  };

export default LoadPass;
