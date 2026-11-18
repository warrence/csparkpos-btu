// Watchman's existing macOS root uses /Code while this checkout uses /code.
// Normalize this one dependency prefix without modifying shared Watchman state.
const fs=require('fs'),path=require('path');
const modules=fs.realpathSync(path.join(__dirname,'node_modules'));
const root=path.join(modules,'react-native');
const original=require(path.join(root,'jest/hasteImpl'));
exports.getHasteName=function(file){const normalized=file.toLowerCase().startsWith((root+'/').toLowerCase())?root+file.slice(root.length):file;return original.getHasteName(normalized);};
