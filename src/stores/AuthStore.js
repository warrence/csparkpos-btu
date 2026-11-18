import { types, flow } from 'mobx-state-tree';
import realm from '../realm';
import { AsyncStorage } from 'react-native';

const AuthStore = types.model({
  userName: types.optional(types.string, ''),
  fullName: types.optional(types.string, ''),
  level: types.optional(types.number, 9),
}).actions(self => {
  let revision = 0;
  let initialized = false;
  let restoring = null;
  let removed = false;
  let persistence = Promise.resolve();
  const persist = operation => {
    // Serialize auth writes so a delayed login write cannot undo logout.
    persistence = persistence.then(operation).catch(() => false);
  };
  const clear = () => {
    self.userName = '';
    self.fullName = '';
    self.level = 9;
    persist(() => AsyncStorage.multiRemove(['userName', 'fullName', 'level']));
  };
  const assign = user => {
    self.userName = user.employeeId;
    self.fullName = user.employeeName;
    self.level = user.employeeLevel;
    const values = [
      ['userName', self.userName], ['fullName', self.fullName], ['level', String(self.level)],
    ];
    persist(() => AsyncStorage.multiSet(values));
  };
  const result = () => ({authenticated: !!self.userName, removed});
  const validate = id => {
    const user = Array.from(realm.objects('Pass')).find(pass => pass.employeeId === id);
    if (id && user) {
      assign(user);
    } else {
      removed = removed || !!id;
      clear();
    }
    return result();
  };
  const restore = flow(function* () {
    const version = revision;
    let id;
    try {
      id = yield AsyncStorage.getItem('userName');
    } catch (error) {
      if (version !== revision) return result();
      removed = true;
    }
    if (version !== revision) return result();
    initialized = true;
    return validate(id);
  });
  return {
    login(credential) {
      const user = Array.from(realm.objects('Pass')).find(pass =>
        pass.employeeId === credential.userName && pass.employeePassword === credential.password);
      if (!user) return false;
      revision += 1;
      initialized = true;
      removed = false;
      assign(user);
      return true;
    },
    logout() {
      revision += 1;
      initialized = true;
      removed = true;
      clear();
    },
    restoreSession() {
      if (initialized) return Promise.resolve(validate(self.userName));
      if (!restoring) restoring = restore().then(value => { restoring = null; return value; });
      return restoring;
    },
  };
});

export { AuthStore };
export default AuthStore.create();
