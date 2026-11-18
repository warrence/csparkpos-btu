import axios from 'axios';
import realm from '../../realm';
import { Alert } from 'react-native';
import { Client } from 'bugsnag-react-native';
import { SERVER_URL } from '../../global';

const bugsnag = new Client();

const LoadOffence = async () => {
  return await axios.get(`${SERVER_URL}/api/load-data/offence`)
    .then(response => {
      const offences = response.data.map((data) => {
        return {
          city: data.City,
          code: data.aCode,
          description: data.Descript,
          amount: data.Amount,
          dayPay: data.Day_pay,
          disPercent: data.Dis_percent,
          dayPay2: data.Day_pay2,
          disPercent2: data.Dis_percent2,
          workingDaysOnly: false
        };
      });

      try {
        realm.write(() => {
          realm.delete(realm.objects('Offence'));
          offences.forEach((offence) => {
            realm.create('Offence', offence);
          });
        });
      } catch (error) {
        return false;
      }


      return true;
    })
    .catch(error => {
      bugsnag.notify(error);
      Alert.alert(error);
      return false;
    });
  };

export default LoadOffence;
