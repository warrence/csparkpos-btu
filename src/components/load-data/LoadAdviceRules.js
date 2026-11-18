import {validateAdviceRules} from '../../advice/rules';
import axios from 'axios';
import realm from '../../realm';
import {SERVER_URL} from '../../global';

export default async function LoadAdviceRules() {
  try {
    const response = await axios.get(`${SERVER_URL}/api/load-data/advice-rules`);
    // A SPA fallback or malformed transport response is not an office policy.
    // Keep a prior valid cache; explicit JSON policy revocations still disable it.
    if (!response.data || typeof response.data !== 'object' || Array.isArray(response.data))
      return false;
    realm.write(() => {
      realm.create('AdviceRules', {id: 'current', json: JSON.stringify(response.data), loadedAt: new Date()}, true);
    });
    validateAdviceRules(response.data);
    return true;
  } catch (error) {
    // Keep the last successfully downloaded configuration for offline use.
    return false;
  }
}
