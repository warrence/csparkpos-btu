import axios from 'axios';
import realm from '../../realm';
import { Alert } from 'react-native';
import { Client } from 'bugsnag-react-native';
import { SERVER_URL } from '../../global';

const bugsnag = new Client();

const LoadOpTable = async () => {
  return await axios.get(`${SERVER_URL}/api/load-data/optable`)
    .then(response => {
      const optables = response.data.map((data) => {
        return {
          amount: data.Amount,
          //couponType: parseInt(data.CouponType),
          //couponQty: data.CouponQty,
          //Ind: data.Ind
        };
      });

      try {
        realm.write(() => {
          realm.delete(realm.objects('OpTable'));
          optables.forEach((optable) => {
            realm.create('OpTable', optable);
          });
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

export default LoadOpTable;
