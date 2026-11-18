import {assertNoRemovedSale, nextOtherReceiptCounter} from '../../payments/receiptRemoval';
import React, { Component } from 'react';
import {
  Container,
  Text,
  Grid,
  Row,
  Col,
  Card,
  Body,
  CardItem,
  Icon,
  Button,
  Item,
  Input,
  Label,
  Right,
  Left,
  List,
  ListItem,
  Toast,
  Picker
} from 'native-base';
import { ScrollView, FlatList } from 'react-native';
import _ from 'lodash';
import { inject, observer } from 'mobx-react';
import realm from '../../realm';
import { moderateScale } from '../../scaling';
import PrintReceipt from '../../printReceipt';
import Dialog from 'react-native-dialog';
import { bnmRound } from '../../helpers';
import { Alert } from 'react-native';

@inject('generalStore', 'authStore') @observer
export default class MBillPayment extends Component {

  constructor() {
    super();
    const cities = realm.objects('City');
    this.state = {
      data: [],
      cityData: cities,
      city: cities[0].code,
      mBillNo: '',
      amount: '',
      total: 0,
      dialogVisible: false,
      qrdialogVisible: false,
      scannedData: '',
      reprintReceiptNo: '',
      amountReceived: '',
      printReceipt: new PrintReceipt()
    };
  }

  componentWillMount() {
    const mbill = realm.objects('MBillReceiptHeader').sorted('receiptNo', true)[0];
    if (mbill) {
      this.setState({ reprintReceiptNo: mbill.receiptNo });
    }
  }

  showReprintDialog() {
    this.setState({ dialogVisible: true });
  }

  showQRDialog() {
    this.setState({ qrdialogVisible: true, scannedData: '' });
  }

  handleCancel = () => {
    this.setState({ dialogVisible: false, qrdialogVisible: false });
  };

  handleReprint = () => {
    // The user has pressed the "Delete" button, so here you can do your own logic.
    // ...Your logic
    //let pReceipt = new PrintReceipt(this.state.reprintReceiptNo, 'coupon');
    this.setState({ dialogVisible: false });
    this.state.printReceipt.print('mbill', this.state.reprintReceiptNo);
  };

  renderItem = ({ index, item }) => {
      return (
        <ListItem icon style={{ marginLeft: 0, flex: 1 }}>
          <Left><Text>{index + 1}.</Text></Left>
          <Body style={{ flex: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ flex: 4 }}>{item.mBillNo}</Text>
            <Text style={{ flex: 4 }}>{item.city}</Text>
            <Text style={{ flex: 4 }}>{item.price.toFixed(2)}</Text>
          </Body>
          <Right>
            <Button transparent onPress={() => this.deleteItem(item)}>
              <Icon type="Entypo" name="cross" style={{ color: 'red' }} />
            </Button>
          </Right>
        </ListItem>
      );
  };

  onCityChange(text) {
    this.setState({ city: text });
  }

  onMBillNoChange(text) {
    this.setState({ mBillNo: text.replace(/[^0-9]/g, '') });
  }


  onAmountChange(text) {
    this.setState({ amount: text });
  }

  onReprintReceiptNoChange(text) {
    this.setState({ reprintReceiptNo: text });
  }

  onAmountReceivedChange(text) {
    this.setState({ amountReceived: text });
  }
  
  onScannedDataChange(text) {
    this.setState({ scannedData: text });
  }

  recalculateItem(newData) {
    return newData.reduce((total, obj) => {
      if (typeof obj.price === 'string') {
        return total + Number(obj.price) + Number(obj.taxAmount);
      }
      return total + obj.price + obj.taxAmount;
    }, 0);
  }

  deleteItem(value) {
    const newData = _.cloneDeep(this.state.data);
    newData.splice(this.state.data.indexOf(value), 1);

    const total = this.recalculateItem(newData);

    this.setState({ data: newData, total: total.toFixed(2) });
  }

  clearForm() {
    this.setState({
      mBillNo: '',
      amount: '',
      data: [],
      total: 0
    });
    
    this.mBillNo._root.focus();
  }

  reprintReceipt() {
    this.showReprintDialog();
  }

  addItem() {
    if (this.state.data.length > 0) {
      Toast.show({
        text: 'Only 1 item allowed!',
        buttonText: 'OK',
        position: 'top',
        type: 'danger',
        textStyle: { fontSize: 50 },
        duration: 5000
      });
      return;
    }

    if (this.state.mBillNo === '') {
        Toast.show({
          text: 'Please enter Bill No.',
          buttonText: 'OK',
          position: 'top',
          type: 'danger',
          textStyle: { fontSize: 50 },
          duration: 5000
        });
        this.mBillNo._root.focus();
        return;
    } else if (this.state.city === '') {
      Toast.show({
        text: 'Please Select City.',
        buttonText: 'OK',
        position: 'top',
        type: 'danger',
        textStyle: { fontSize: 50 },
        duration: 5000
      });
      this.city._root.focus();
      return;
    } else if (this.state.amount <= 0) {
        this.amount._root.focus();
        Toast.show({
          text: 'Minim Amount is 1',
          buttonText: 'OK',
          position: 'top',
          type: 'danger',
          textStyle: { fontSize: 50 },
          duration: 5000
        });
  
        return;
    }

    const newData = _.cloneDeep(this.state.data);
    newData.push({
      mBillNo: this.state.mBillNo,
      price: parseFloat(this.state.amount),
      city: this.state.city,
      // taxAmount: (this.state.billAmount * this.props.generalStore.Tax) / 100
      taxAmount: 0,
    });


    const total = bnmRound(this.recalculateItem(newData));

    this.setState({
      data: newData,
      total,
      mBillNo: '',
      amount: ''
    });
  }

  processPayment() {
    if (this.state.data.length <= 0) {
      Toast.show({
        text: 'Purchase Item List is empty!',
        buttonText: 'OK',
        position: 'top',
        type: 'danger',
        textStyle: { fontSize: 50 },
        duration: 5000
      });

      this.mBillNo._root.focus();

      return;
    }

    const generalProfile = realm.objects('GeneralProfile')[0];
    let newReceiptNo;
    try {
      assertNoRemovedSale(realm,'mbill',this.state.city,this.state.data);
      newReceiptNo=nextOtherReceiptCounter(realm,generalProfile,'mbill');
    } catch(error) {Alert.alert('Payment not saved',error.message);return;}
    const mbillReceiptNo = `${generalProfile.MBillReceiptPrefix}-${generalProfile.PondokId}-${newReceiptNo}`;

    realm.write(() => {
      //CREATE RECEIPT HEADER
      const mBillReceipt = realm.create('MBillReceiptHeader', {
        receiptNo: mbillReceiptNo,
        userName: this.props.authStore.userName,
        receiptDate: new Date(),
        city: this.state.city,
        pondokId: this.props.generalStore.PondokId,
        qrData: this.state.scannedData
      });

      //CREATE RECEIPT ITEM
      this.state.data.forEach((item) => {
        mBillReceipt.items.push({
          mBillNo: item.mBillNo,
          amount: item.price,
          taxAmount: item.taxAmount,
          tax: this.props.generalStore.Tax,
          city: this.state.city,
          qrData: this.state.scannedData
        });
      });

      //UPDATE LATEST RECEIPT NO
      generalProfile.MBillReceiptNo = newReceiptNo;

      this.state.reprintReceiptNo = mbillReceiptNo;
      
      this.state.printReceipt.print('mbill', mbillReceiptNo);
      const change = this.state.amountReceived - this.state.total;
      Alert.alert(`Receipt No: ${mbillReceiptNo} , Change: ${change}`);

      this.clearForm();
    });
  }

  async processQr() {
    const parsedJson = JSON.parse(this.state.scannedData);
    await this.setState({
      mBillNo: parsedJson.mBillNo,
      amount: parsedJson.amount,
      city: parsedJson.city
    }, () => {
      // Callback function, called after setState is done
      const newData = _.cloneDeep(this.state.data);
      newData.push({
        mBillNo: this.state.mBillNo,
        price: this.state.amount,
        city: this.state.city,
        // taxAmount: (this.state.billAmount * this.props.generalStore.Tax) / 100
        taxAmount: 0,
      });


      const total = bnmRound(this.recalculateItem(newData));

      this.setState({
        data: newData,
        total,
        mBillNo: '',
        amount: ''
      });
      this.handleCancel();
    });
  }

  render() {
    return (
      <Container style={styles.containerStyle}>
        <Grid>
          <Row style={{ padding: moderateScale(0) }}>
            <Col style={{ flex: 4, padding: moderateScale(3) }}>
              <Card >
                <CardItem style={{ flex: 1 }}>
                  <Card style={{ flex: 1 }}>
                    <CardItem header bordered style={{ height: moderateScale(10) }}>
                      <Text style={{ fontSize: moderateScale(10) }}>Purchase Item</Text>
                    </CardItem>
                    <CardItem style={{ flex: 1, alignItems: 'flex-start' }}>
                      <ScrollView>
                        <List>
                          <ListItem icon style={{ marginLeft: 0, flex: 1, height: moderateScale(10) }}>
                            <Left><Text>#</Text></Left>
                            <Body style={{ flex: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                              <Text style={{ flex: 4, fontSize: moderateScale(8) }}>Bill No</Text>
                              <Text style={{ flex: 4, fontSize: moderateScale(8) }}>City</Text>
                              <Text style={{ flex: 4, fontSize: moderateScale(8) }}>Bill Amount</Text>
                            </Body>
                            <Right>
                              <Button transparent disabled>
                                <Icon type="Ionicons" name="ios-trash-outline" />
                              </Button>
                            </Right>
                          </ListItem>
                          <FlatList
                            data={this.state.data}
                            renderItem={this.renderItem}
                            keyExtractor={item => item.mBillNo}
                          />
                        </List>
                      </ScrollView>
                    </CardItem>
                    <CardItem bordered footer style={{ height: moderateScale(40) }}>
                      <Left style={{ flex: 1 }}>
                        <Button iconLeft small rounded full success style={{ flex: 1 }} onPress={this.processPayment.bind(this)}>
                          <Icon type="FontAwesome" name='money' />
                          <Text>Pay</Text>
                        </Button>
                      </Left>
                      <Body>
                      <Item regular style={{ width: 150, marginLeft: 10 }}>
                        <Input
                          value={this.state.amountReceived.toString()}
                          style={{ fontSize: moderateScale(8) }}
                          placeholder="Amount Received"
                          onChangeText={(text) => { this.onAmountReceivedChange(text); }}
                          keyboardType='numeric'
                        />
                      </Item>
                      </Body>
                      <Right style={{ flex: 2 }}><Text style={{ fontSize: moderateScale(30), fontWeight: 'bold', color: 'darkred' }}>{this.state.total}</Text></Right>
                    </CardItem>
                  </Card>
                </CardItem>
              </Card>
            </Col>
            <Col style={{ flex: 2, padding: moderateScale(3) }}>
              <Card>
                <CardItem >
                  <Picker
                    mode="dropdown"
                    iosIcon={<Icon name="ios-arrow-down-outline" />}
                    style={styles.cityPicker}
                    placeholderStyle={{ color: '#bfc6ea' }}
                    placeholderIconColor="#007aff"
                    selectedValue={this.state.city}
                    onValueChange={(text) => { this.onCityChange(text); }}
                    enabled={this.state.enableCity}
                  >
                    {this.state.cityData.map((item) => {
                      return (<Item label={item.code} value={item.code} key={item.code} />);
                    })}
                  </Picker>
                </CardItem>
                <CardItem >
                  <Item floatingLabel>
                    <Label style={{ fontSize: moderateScale(10) }}>Bill Number</Label>
                    <Input
                      getRef={(c) => { this.mBillNo = c; }}
                      keyboardType='numeric'
                      //autoFocus={true}
                      value={this.state.mBillNo}
                      style={{ fontSize: moderateScale(10) }}
                      onChangeText={(text) => { this.onMBillNoChange(text); }}
                    />
                  </Item>
                </CardItem>
                <CardItem>
                  <Item floatingLabel>
                    <Label style={{ fontSize: moderateScale(10) }}>Bill Amount</Label>
                    <Input
                      getRef={(c) => { this.amount = c; }}
                      value={this.state.amount}
                      keyboardType='numeric'
                      style={{ fontSize: moderateScale(10) }}
                      onChangeText={(text) => { this.onAmountChange(text); }}
                    
                    />
                  </Item>
                </CardItem>
                <CardItem bordered style={{ flex: 1, flexDirection: 'row', justifyContent: 'space-between' }}>

                  <Button iconLeft full block primary onPress={this.addItem.bind(this)}>
                    <Icon name='md-add' />
                    <Text>Add</Text>
                  </Button>

                  <Button iconLeft full block warning onPress={this.clearForm.bind(this)}>
                    <Icon type="MaterialIcons" name='clear' />
                    <Text>Clear</Text>
                  </Button>

                </CardItem>
                <CardItem bordered style={{ flex: 1, flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Button iconLeft full block primary onPress={this.showQRDialog.bind(this)}>
                    <Icon name='md-add' />
                    <Text>Scan QR With Scanner</Text>
                  </Button>
                </CardItem>
                
                <CardItem>
                  <Button iconLeft full block primary onPress={this.reprintReceipt.bind(this)}>
                    <Icon name='md-add' />
                    <Text>Reprint Receipt</Text>
                  </Button>
                </CardItem>
              </Card>
            </Col>
          </Row>
        </Grid>

        <Dialog.Container visible={this.state.dialogVisible}>
          <Dialog.Title>Reprint Receipt</Dialog.Title>
          <Dialog.Input
            label="Receipt No."
            onChangeText={(text) => { this.onReprintReceiptNoChange(text); }}
            value={this.state.reprintReceiptNo}
          />
          <Dialog.Button label="Cancel" onPress={this.handleCancel} />
          <Dialog.Button label="Print" onPress={this.handleReprint} />
        </Dialog.Container>

        <Dialog.Container visible={this.state.qrdialogVisible}>
          <Dialog.Title>Waiting Scan</Dialog.Title>
          <Dialog.Input
            style={{ display: 'none' }}
            autoFocus
            onChangeText={(text) => { this.onScannedDataChange(text); }}
            value={this.state.scannedData}
            onSubmitEditing={() => { this.processQr(); }}
          />
          <Dialog.Button label="Cancel" onPress={this.handleCancel} />
        </Dialog.Container>

      </Container>

    );
  }
}

const styles = {
  containerStyle: {
    flex: 1,
    flexDirection: 'row',
    //alignItems: 'center',
    justifyContent: 'center',
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
  purchaseListHeader: {
    fontSize: moderateScale(10)
  }
};
