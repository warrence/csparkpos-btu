import axios from 'axios';
import realm from '../../realm';
import { Client } from 'bugsnag-react-native';
import { SERVER_URL } from '../../global';
import {cachedCalendarDays} from '../../payments/calendarWindow';

const bugsnag = new Client();

const LoadCity = async () => {
  return await axios.get(`${SERVER_URL}/api/load-data/city`)
    .then(response => {

      const cities = response.data.map((data) => {
        let allowOverduePa2 = false;

        if (data.AllowOverduePa === 'Y') {
          allowOverduePa2 = true;
        }

        return {
          code: data.City,
          name: data.CityName,
          opExpiryDay: cachedCalendarDays(data.OpExpiryDay),
          compoundExpiryDay: cachedCalendarDays(data.CompoundExpiryDay),
          expiryPaRate: data.ExpiryPARate,
          address1: data.Add1,
          address2: data.Add2,
          address3: data.Add3,
          telephone: data.Tel,
          gstRegNo: data.Gst_regno,
          allowOverduePa: allowOverduePa2
        };
      });

      try {
        realm.write(() => {
          realm.delete(realm.objects('City'));
          cities.forEach((city) => {
            realm.create('City', city);
          });
        });
      } catch (error) {
        console.log(error)
        return false;
      }

      return true;
    })
    .catch(error => {
        console.log(error)

      bugsnag.notify(error);
      return false;
    });
  };

export default LoadCity;
