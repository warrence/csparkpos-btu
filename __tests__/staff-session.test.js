// Synthetic staff only. No production requests, device storage or credentials.
jest.mock('../src/realm', () => ({
  rows: [], failWrite: false, untouched: {receipt: 'immutable synthetic receipt', profile: 'synthetic'},
  objects: jest.fn(function(name) {
    if (name !== 'Pass') throw new Error('Unexpected table ' + name);
    return this.rows;
  }),
  write: jest.fn(function(operation) {
    const original = this.rows.slice();
    try { operation(); if (this.failWrite) throw new Error('Synthetic write failure'); }
    catch (error) { this.rows = original; throw error; }
  }),
  delete: jest.fn(function() { this.rows = []; }),
  create: jest.fn(function(name, row) { this.rows.push(row); }),
}));
jest.mock('axios', () => ({get: jest.fn()}));
jest.mock('../src/global', () => ({SERVER_URL: 'http://fixture.invalid'}));
jest.mock('bugsnag-react-native', () => ({Client: class {notify() {}}}));
jest.mock('react-native-router-flux', () => ({Actions: {login: jest.fn()}}));

const realm = require('../src/realm').default || require('../src/realm');
const {AsyncStorage} = require('react-native');
jest.spyOn(AsyncStorage, 'getItem');
jest.spyOn(AsyncStorage, 'multiSet');
jest.spyOn(AsyncStorage, 'multiRemove');
const axios = require('axios');
const {Actions} = require('react-native-router-flux');
const {AuthStore} = require('../src/stores/AuthStore');
const singleton = require('../src/stores/AuthStore').default;
const LoadPass = require('../src/components/load-data/LoadPass').default;
const staff = (id = '0007', name = 'Synthetic Staff', level = 2) => ({
  employeeId: id, employeeName: name, employeePassword: 'synthetic-only', employeeLevel: level,
});
const payload = row => ({emp_rec: 1, employeeID: row.employeeId, employee: row.employeeName,
  password: row.employeePassword, level: row.employeeLevel});
const login = store => store.login({userName: '0007', password: 'synthetic-only'});
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
let disk;
beforeEach(async () => {
  await flush();
  jest.clearAllMocks();
  realm.rows = [staff()]; realm.failWrite = false;
  disk = {otherConfig: 'keep', pendingPayload: 'immutable'};
  AsyncStorage.getItem.mockImplementation(key => Promise.resolve(disk[key] || null));
  AsyncStorage.multiSet.mockImplementation(values => {
    values.forEach(([key, value]) => { disk[key] = value; }); return Promise.resolve();
  });
  AsyncStorage.multiRemove.mockImplementation(keys => {
    keys.forEach(key => delete disk[key]); return Promise.resolve();
  });
  singleton.logout(); await flush();
});

test('offline restart restores exact leading-zero identity and current cached name/level', async () => {
  disk.userName = '0007'; disk.fullName = 'Stale'; disk.level = '99';
  const store = AuthStore.create();
  expect(await store.restoreSession()).toEqual({authenticated: true, removed: false});
  expect(store.userName).toBe('0007'); expect(store.fullName).toBe('Synthetic Staff'); expect(store.level).toBe(2);
  await flush(); expect(disk.level).toBe('2'); expect(disk.otherConfig).toBe('keep');
});
test.each([[[]], [[staff('7')]]])('restart rejects removed or differently formatted identity', async rows => {
  disk.userName = '0007'; realm.rows = rows;
  const store = AuthStore.create();
  expect(await store.restoreSession()).toEqual({authenticated: false, removed: true});
  await flush(); expect(disk.userName).toBeUndefined(); expect(disk.pendingPayload).toBe('immutable');
});
test('fresh installation with no staff or saved identity remains eligible for Load Data', async () => {
  realm.rows = [];
  expect(await AuthStore.create().restoreSession()).toEqual({authenticated: false, removed: false});
});
test('logout clears only authentication and serializes behind pending login writes', async () => {
  const store = AuthStore.create(); expect(login(store)).toBe(true); store.logout();
  await flush(); expect(disk.userName).toBeUndefined(); expect(disk.otherConfig).toBe('keep');
  expect(store.level).toBe(9); expect(realm.rows).toEqual([staff()]);
});
test('invalid credentials stay synchronous and do not authenticate', () => {
  expect(AuthStore.create().login({userName: '0007', password: 'wrong-synthetic'})).toBe(false);
});
test('pending startup cannot restore a session after logout', async () => {
  let resolve; AsyncStorage.getItem.mockImplementation(() => new Promise(done => { resolve = done; }));
  const store = AuthStore.create(); const loading = store.restoreSession(); store.logout(); resolve('0007');
  expect(await loading).toEqual({authenticated: false, removed: true}); expect(store.userName).toBe('');
});
test('pending startup cannot overwrite a newer successful login', async () => {
  let resolve; AsyncStorage.getItem.mockImplementation(() => new Promise(done => { resolve = done; }));
  const store = AuthStore.create(); const loading = store.restoreSession();
  realm.rows.push(staff('0008', 'Second Synthetic', 3));
  expect(store.login({userName: '0008', password: 'synthetic-only'})).toBe(true); resolve('0007');
  await loading; expect(store.userName).toBe('0008');
});
test('storage read failure fails closed; removal write failure cannot authenticate in memory', async () => {
  AsyncStorage.getItem.mockRejectedValue(new Error('Synthetic storage error'));
  AsyncStorage.multiRemove.mockRejectedValue(new Error('Synthetic storage error'));
  const store = AuthStore.create();
  expect(await store.restoreSession()).toEqual({authenticated: false, removed: true});
  await flush(); expect(store.userName).toBe('');
});
test('successful refresh removes the active employee and redirects without touching receipts/config', async () => {
  login(singleton); const untouched = {...realm.untouched};
  axios.get.mockResolvedValue({data: [payload(staff('0008'))]});
  expect(await LoadPass()).toBe(true); await flush();
  expect(singleton.userName).toBe(''); expect(Actions.login).toHaveBeenCalledTimes(1);
  expect(realm.untouched).toEqual(untouched); expect(disk.pendingPayload).toBe('immutable');
  expect(realm.objects.mock.calls.every(([name]) => name === 'Pass')).toBe(true);
});
test('present staff retains identity with refreshed display name and level', async () => {
  login(singleton); axios.get.mockResolvedValue({data: [payload(staff('0007', 'Updated Synthetic', 4))]});
  expect(await LoadPass()).toBe(true);
  expect(singleton.userName).toBe('0007'); expect(singleton.fullName).toBe('Updated Synthetic');
  expect(singleton.level).toBe(4); expect(Actions.login).not.toHaveBeenCalled();
});
test('successful empty refresh invalidates identity; empty is not a network failure', async () => {
  login(singleton); axios.get.mockResolvedValue({data: []});
  expect(await LoadPass()).toBe(true); expect(realm.rows).toEqual([]);
  expect(singleton.userName).toBe(''); expect(Actions.login).toHaveBeenCalled();
});
test.each(['network', 'mapping', 'transaction'])('%s failure preserves old cache and active session', async failure => {
  login(singleton);
  if (failure === 'network') axios.get.mockRejectedValue(new Error('Synthetic offline'));
  else axios.get.mockResolvedValue({data: failure === 'mapping' ? null : []});
  realm.failWrite = failure === 'transaction';
  expect(await LoadPass()).toBe(false); expect(realm.rows).toEqual([staff()]);
  expect(singleton.userName).toBe('0007'); expect(Actions.login).not.toHaveBeenCalled();
});
test('refresh during pending startup validates against newly committed cache', async () => {
  let resolve; AsyncStorage.getItem.mockImplementation(() => new Promise(done => { resolve = done; }));
  const store = AuthStore.create(); const loading = store.restoreSession();
  realm.rows = []; resolve('0007');
  expect(await loading).toEqual({authenticated: false, removed: true});
});
