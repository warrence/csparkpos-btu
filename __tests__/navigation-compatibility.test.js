// Exercise real navigation/UI imports with native storage, networking and
// hardware isolated. This is not a device or production-transaction test.
jest.mock('../src/realm', () => ({objects: () => []}));
jest.mock('realm/react-native', () => ({ListView: require('react-native').ListView}));
jest.mock('axios', () => ({
  get: jest.fn(() => Promise.resolve({data: []})),
  post: jest.fn(() => Promise.resolve({data: {}})),
}));
jest.mock('bugsnag-react-native', () => ({Client: class { notify() {} }}));

const React = require('react');
const renderer = require('react-test-renderer');
const {NativeModules, Platform} = require('react-native');
Platform.OS = 'android';
NativeModules.BluetoothSerial = {connect: jest.fn(() => Promise.resolve({message: 'test'}))};
NativeModules.Orientation = {lockToLandscape: jest.fn()};
NativeModules.BTModule = {connect: jest.fn(), print: jest.fn(), write: jest.fn(), stop: jest.fn()};
const App = require('../src/App').default;
const {Actions} = require('react-native-router-flux');

test('application mounts and login navigation renders on the upgraded React runtime', async () => {
  let tree;
  renderer.act(() => { tree = renderer.create(<App />); });
  await new Promise(resolve => setTimeout(resolve, 100));
  renderer.act(() => { Actions.login(); });
  await new Promise(resolve => setTimeout(resolve, 100));
  expect(Actions.currentScene).toBe('login');
  expect(typeof Actions.adviceNoticePayment).toBe('function');
  expect(require('axios').post).not.toHaveBeenCalled();
  expect(JSON.stringify(tree.toJSON())).toContain('CS Park POS');
  tree.unmount();
});
