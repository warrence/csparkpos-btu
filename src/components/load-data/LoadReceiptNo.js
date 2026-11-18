import axios from 'axios';
import realm from '../../realm';
import { Client } from 'bugsnag-react-native';
import { SERVER_URL } from '../../global';

const bugsnag = new Client();

const LoadCity = async () => {
  return await axios.get(`${SERVER_URL}/api/load-receiptno/${this.state.pondok_to_load}`)
    .then(response => {
      const cities = response.data.map((data) => {
        return {
          code: data.City,
          name: data.CityName,
          opExpiryDay: data.OpExpiryDay,
          compoundExpiryDay: data.CompoundExpiryDay,
          expiryPaRate: data.ExpiryPARate,
          address1: data.Add1,
          address2: data.Add2,
          address3: data.Add3,
          telephone: data.Tel,
          gstRegNo: data.Gst_regno
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
        return false;
      }

      return true;
    })
    .catch(error => {
      bugsnag.notify(error);
      return false;
    });
  };

export default LoadCity;
