import { AppRegistry, YellowBox } from 'react-native';
import { Client, Configuration } from 'bugsnag-react-native';
import App from './src/App';

const configuration = new Configuration();
configuration.releaseStage = 'development';
configuration.notifyReleaseStages = ['production'];

const bugsnag = new Client(configuration);

bugsnag.setUser('888', 'HUAWEI T3 TEST', 'warrence@gmail.com');

YellowBox.ignoreWarnings(['Warning: isMounted(...) is deprecated', 'Module RCTImageLoader']);

AppRegistry.registerComponent('csparkpos', () => App);
