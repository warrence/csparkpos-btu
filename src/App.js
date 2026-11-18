import {cleanupPreviouslyUploaded} from './payments/receiptRemoval';
import React, { Component } from 'react';
import { Provider } from 'mobx-react';
import { NativeModules } from 'react-native';
import Router from './Router';
import AuthStore from './stores/AuthStore';
import GeneralStore from './stores/GeneralStore';
import Orientation from 'react-native-orientation';
import { Root, Toast } from 'native-base';
import realm from './realm';
import BTModule from './BTModule';
import BluetoothSerial from "react-native-bluetooth-serial";
import { moderateScale } from "./scaling";


class App extends Component {

  constructor(props) {
    super(props);

    this.stores = {
      authStore: AuthStore,
      generalStore: GeneralStore
    };
    this.state = {
      bluetoothPrinter: null,
      bluetoothPrinterConnected: false,
    };
  }

  componentWillMount() {
    cleanupPreviouslyUploaded(realm);
    const generalProfile = realm.objects('GeneralProfile')[0];
    this.setState({ generalProfile: generalProfile });
    AuthStore.restoreSession();

    if (generalProfile) {
      this.connectBluetoothPrinter(generalProfile.printerAddress);
    }



    BluetoothSerial.on('connectionSuccess', () => {
      this.setState({ bluetoothPrinterConnected: true });

      Toast.show({
        text: 'Bluetooth printer connected.',
        buttonText: 'OK',
        position: 'bottom',
        type: 'success',
        textStyle: { fontSize: moderateScale(10) },
        duration: 3000
      });
    });

    BluetoothSerial.on('connectionLost', () => {
      this.setState({ bluetoothPrinterConnected: false });
      Toast.show({
        text: 'Bluetooth printer disconnected.',
        buttonText: 'OK',
        position: 'bottom',
        type: 'danger',
        textStyle: { fontSize: moderateScale(10) },
        duration: 3000
      });


    });
  }

  connectBluetoothPrinter(printerAddress) {

    if (printerAddress !== null) {
      BluetoothSerial.connect(printerAddress)
        .then((res) => {

          let toastType = 'success';
          if (res) {
            toastType = 'success';
            this.setState({ bluetoothPrinterConnected: true });
          } else {
            this.setState({ bluetoothPrinterConnected: false });
            toastType = 'danger';
          }

          BluetoothSerial.getDevice

          Toast.show({
            text: res.message,
            buttonText: 'OK',
            position: 'bottom',
            type: toastType,
            textStyle: { fontSize: moderateScale(10) },
            duration: 3000
          });
        });
    }
  }

  componentDidMount() {
    Orientation.lockToLandscape();
    //Orientation.addOrientationListener(this._orientationDidChange);
  }

  render() {
    return (
      <Root>
        <Provider {...this.stores}>
          <Router />
        </Provider>
      </Root>
    );
  }
}

export default App;
