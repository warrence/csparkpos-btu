import axios from 'axios';
import realm from '../../realm';
import {holidayDates, kuchingDate} from '../../payments/holidayCalendar';
import { Alert } from 'react-native';
import { Client } from 'bugsnag-react-native';
import { SERVER_URL } from '../../global';

const bugsnag = new Client();

const LoadHoliday = async () => {
  return await axios.get(`${SERVER_URL}/api/load-data/holiday`)
    .then(response => {
      // Validate the complete response before replacing the last good snapshot.
      const dates = holidayDates(response.data);
      const headers = response.headers || {};
      const revision = headers['x-holiday-revision'] || null;
      const generated = headers['x-holiday-generated-at'];
      if (revision && !/^[a-f0-9]{64}$/.test(revision)) throw new Error('Invalid holiday revision.');
      if (headers['x-holiday-timezone'] && headers['x-holiday-timezone'] !== 'Asia/Kuching')
        throw new Error('Holiday calendar timezone differs from Asia/Kuching.');
      const serverGeneratedAt = generated ? new Date(generated) : null;
      if (serverGeneratedAt && !Number.isFinite(serverGeneratedAt.getTime())) throw new Error('Invalid holiday generation time.');
      const holidays = response.data.filter(data => !data.deleted_at).map(data => ({
        holidayName: data.Holiday || '', holidayDate: kuchingDate(data.HolidayDate).toDate()
      }));

      try {
        realm.write(() => {
          realm.delete(realm.objects('Holiday'));
          realm.create('HolidayCalendar', {id: 'current', json: JSON.stringify(dates), loadedAt: new Date(), revision, serverGeneratedAt}, true);
          holidays.forEach((holiday) => {
            realm.create('Holiday', holiday);
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

export default LoadHoliday;
