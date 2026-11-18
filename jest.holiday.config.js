const fs = require('fs');
const path = require('path');
module.exports = {
  ...require('./package.json').jest,
  // Jest 24 does not scan symlinked React Native haste modules automatically.
  roots: [__dirname, fs.realpathSync(path.dirname(require.resolve('react-native/package.json')))],
  moduleNameMapper: {'^realm/react-native$': '<rootDir>/test-support/realmNative.js'},
};
