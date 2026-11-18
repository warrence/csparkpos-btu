// These exercise the JS/native bridge contract; they do not contact a printer.
const {NativeModules, DeviceEventEmitter} = require('react-native');

NativeModules.BluetoothSerial = {
  writeToDevice: jest.fn(() => Promise.resolve(true)),
};
NativeModules.BTModule = {
  connect: jest.fn(), print: jest.fn(), write: jest.fn(), stop: jest.fn(),
};

const BluetoothSerial = require('react-native-bluetooth-serial');
const BTModule = require('../src/BTModule');

test('serial printing preserves UTF-8 bytes at the native bridge', async () => {
  const receipt = 'Pondok Bintulu\nRM 12.50\n';
  await expect(BluetoothSerial.write(receipt)).resolves.toBe(true);
  const encoded = NativeModules.BluetoothSerial.writeToDevice.mock.calls[0][0];
  expect(Buffer.from(encoded, 'base64').toString('utf8')).toBe(receipt);
});

test('connection events can be subscribed and removed', () => {
  const handler = jest.fn();
  BluetoothSerial.on('connectionSuccess', handler);
  DeviceEventEmitter.emit('connectionSuccess', {message: 'connected'});
  expect(handler).toHaveBeenCalledWith({message: 'connected'});
  BluetoothSerial.removeListener('connectionSuccess', handler);
  DeviceEventEmitter.emit('connectionSuccess', {});
  expect(handler).toHaveBeenCalledTimes(1);
});

test('custom receipt bridge exposes the existing printer operations', () => {
  expect(BTModule).toBe(NativeModules.BTModule);
  for (const operation of ['connect', 'print', 'write', 'stop']) {
    expect(typeof BTModule[operation]).toBe('function');
  }
});
