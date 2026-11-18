// Metro 0.51's Symbol fallback calls path.stop(), which stops Babel visiting
// the rest of a file and can leave Flow types in the release bundle. Skip only
// the replacement subtree so the fallback cannot recurse but traversal continues.
const fs = require('fs');
const file = require.resolve('metro-react-native-babel-preset/src/transforms/transform-symbol-member');
const version = require('metro-react-native-babel-preset/package.json').version;
if (version !== '0.51.1') throw new Error('Review the Symbol transform patch for preset ' + version);
const source = fs.readFileSync(file, 'utf8');
if (source.includes('path.stop();')) {
  fs.writeFileSync(file, source.replace('path.stop();', 'path.skip();'));
} else if (!source.includes('path.skip();')) {
  throw new Error('Unexpected Metro Symbol transform; patch was not applied');
}
console.log('Prepared Metro 0.51.1 Symbol traversal fix');

// ReactPackage no longer declares createJSModules in RN 0.59. Keep the
// legacy no-op method, but remove its obsolete @Override annotation.
const bluetoothPackage = require.resolve('react-native-bluetooth-serial/package.json');
const bluetoothFile = bluetoothPackage.replace('package.json', 'android/src/main/java/com/rusel/RCTBluetoothSerial/RCTBluetoothSerialPackage.java');
const bluetoothSource = fs.readFileSync(bluetoothFile, 'utf8');
const obsoleteOverride = /@Override\s+(public List<Class<\? extends JavaScriptModule>> createJSModules\(\))/;
if (obsoleteOverride.test(bluetoothSource)) {
  fs.writeFileSync(bluetoothFile, bluetoothSource.replace(obsoleteOverride, '$1'));
}
console.log('Prepared BluetoothSerial legacy ReactPackage compatibility');
