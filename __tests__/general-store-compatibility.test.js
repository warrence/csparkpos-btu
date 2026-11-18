// Realm reads are fixtures here: these test hydration through the real MobX
// store after the Babel upgrade, not native disk persistence.
function loadStore(profiles) {
  jest.resetModules();
  jest.doMock('../src/realm', () => ({objects: () => profiles}));
  return require('../src/stores/GeneralStore').default;
}

test('a new installation initializes an empty store without a const assignment error', () => {
  const store = loadStore([]);
  expect(store.PondokId).toBeNull();
  expect(store.OpReceiptNo).toBe(0);
});

test('saved profile and receipt counters hydrate and reload without resetting data', () => {
  const profiles = [{PondokId: 'TEST', PondokName: 'Fixture', OpReceiptNo: 123, printerAddress: '00:11:22:33:44:55'}];
  const store = loadStore(profiles);
  expect(store.PondokId).toBe('TEST');
  expect(store.OpReceiptNo).toBe(123);
  expect(store.printerAddress).toBe('00:11:22:33:44:55');
  profiles[0] = {...profiles[0], OpReceiptNo: 124};
  store.reloadFromStorage();
  expect(store.OpReceiptNo).toBe(124);
  expect(store.PondokId).toBe('TEST');
});
