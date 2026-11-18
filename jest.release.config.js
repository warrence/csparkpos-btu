const path=require('path');
module.exports={...require('./jest.holiday.config'),haste:{hasteImplModulePath:path.join(__dirname,'haste.canonical.js'),providesModuleNodeModules:['react-native']}};
