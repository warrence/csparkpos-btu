import React, { Component } from 'react';
import {Alert} from 'react-native';
import {
  Container,
  Content,
  Text,
  Grid,
  Row,
  Col,
  Card,
  Body,
  CardItem,
  Icon,
  Button,
  Toast,
  Header,
  Footer,
  List,
  ListItem,
  Left,
  Right
} from 'native-base';
import { Actions } from 'react-native-router-flux';
import { moderateScale } from "../scaling";
import BluetoothSerial from "react-native-bluetooth-serial";
import BTModule from "../BTModule";
import {inject, observer} from "mobx-react/index";
import realm from "../realm";
import { EscPos } from 'escpos-xml';
import PrintReceipt from '../printReceipt';

export default class Settings extends Component {

  constructor(props) {
    super(props);
    this.state = {
      isEnabled: false,
      discovering: false,
      devices: [],
      unpairedDevices: [],
      connected: false,
      section: 0
    };
    this.printReceipt = new PrintReceipt();
  }

  componentWillMount() {
    Promise.all([
      BluetoothSerial.isEnabled(),
      BluetoothSerial.list()
    ])
      .then((values) => {
        const [isEnabled, devices] = values;
        this.setState({ isEnabled, devices });
        console.log(this.state.devices);
      });
  }

  usePrinter(address) {

    let generalProfile = realm.objects('GeneralProfile')[0];

    //BTModule.stop();

    realm.write(() => {
      generalProfile.printerAddress = address;
    });

    //BTModule.connect(address);
    BluetoothSerial.connect(address);


    //let buffer = new Uint8Array(printData).buffer;


    //
    //BTModule.print('test');
    //BTModule.write(message);
    //console.log(this.state.devices[0].address);
  }

  async testPrint() {
    if (this._testPrinting) return;
    this._testPrinting = true;
    try {
      await this.printReceipt.print('test');
      Alert.alert('80mm test sent', 'Printer accepted the test. Check both L/R markers, wrapped text and totals on paper. No payment was collected.');
    } catch (error) {
      Alert.alert('Test print failed', error.message);
    } finally { this._testPrinting = false; }
  }

  render() {
    return (
      <Container style={styles.containerStyle}>
        <Content padder>
        <Card>
          <CardItem header bordered>
            <Text>Printer</Text>
          </CardItem>
          <CardItem bordered>
            <List button dataArray={this.state.devices}
                  renderRow={(item) =>
                    <ListItem>
                      <Left><Text>{item.name}</Text></Left>
                      <Right><Button onPress={() => this.usePrinter(item.address)}><Text>Use</Text></Button></Right>
                    </ListItem>
                  }>
            </List>
          </CardItem>
          <CardItem footer bordered>
            <Button onPress={() => this.testPrint()}>
              <Text>Test Print</Text>
            </Button>
          </CardItem>
        </Card>
        </Content>
      </Container>
    );
  }
}

const styles = {
  containerStyle: {
    flex: 1,
    backgroundColor: 'white',
    //flexDirection: 'row',
    //alignItems: 'flex-start',
    //justifyContent: 'flex-start'
  },
  cardStyle: {
    justifyContent: 'center',
    marginBottom: 0,
    marginTop: 0,
    marginLeft: 0,
    marginRight: 0,
  },
  cardBodyStyle: {
    justifyContent: 'center',
    alignItems: 'center'
  },
  cardTitleTextStyle: {
    fontSize: moderateScale(10),
    fontFamily: 'Helvetica-Bold'
  },
  cardLogoStyle: {
    fontSize: moderateScale(50)
  }
};
