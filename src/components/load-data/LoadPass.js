import axios from 'axios';
import realm from '../../realm';
import { Client } from 'bugsnag-react-native';
import { SERVER_URL } from '../../global';
import AuthStore from '../../stores/AuthStore';
import { Actions } from 'react-native-router-flux';

const bugsnag = new Client();

const LoadPass = async () => {
  return await axios.get(`${SERVER_URL}/api/load-data/pass`)
    .then(async response => {
      const passes = response.data.map((data) => {
        return {
          employeeId: data.employeeID,
          employeeName: data.employee,
          employeePassword: data.password,
          employeeLevel: data.level
        };
      });

      try {
        realm.write(() => {
          realm.delete(realm.objects('Pass'));
          passes.forEach((pass) => {
            realm.create('Pass', pass);
          });
        });
      } catch (error) {
        return false;
      }

      const session = await AuthStore.restoreSession();
      if (session.removed) Actions.login();
      return true;
    })
    .catch(error => {
      bugsnag.notify(error);
      return false;
    });
  };

export default LoadPass;
