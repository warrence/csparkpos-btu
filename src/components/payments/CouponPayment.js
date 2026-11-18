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
  Toast
} from 'native-base';
import { ScrollView, FlatList, Alert, Modal, View, TouchableHighlight } from 'react-native';
import _ from 'lodash';
import { inject, observer } from 'mobx-react';
import realm from '../../realm';
import { moderateScale } from "../../scaling";
import PrintReceipt from '../../printReceipt';
import Dialog from "react-native-dialog";
import { bnmRound } from "../../helpers";

// This maintained build is for Bintulu. Disable new coupon sales independently
// of downloaded city/profile state; historical receipts and posting remain available.
const COUPON_COLLECTION_ENABLED = false;
const COUPON_DISABLED_MESSAGE = 'New coupon sales are disabled for Bintulu. Existing receipts can still be viewed, reprinted and uploaded.';

@inject('generalStore', 'authStore') @observer
export default class CouponPayment extends Component {

  constructor() {
    super();
    this.state = {
      data: [],
      qty: '',
      startingCouponNo: '',
      total: 0,
      dialogVisible: false,
      reprintReceiptNo: '',
      printReceipt: new PrintReceipt()
    };
  }

  componentWillMount() {
    const coupon = realm.objects('CouponReceiptHeader').sorted('receiptNo', true)[0];
    if (coupon) {
      this.setState({ reprintReceiptNo: coupon.receiptNo });
    }
  }

  showReprintDialog() {
    this.setState({ dialogVisible: true });
  }

  handleCancel = () => {
    this.setState({ dialogVisible: false });
  };

  handleReprint = () => {
    // The user has pressed the "Delete" button, so here you can do your own logic.
    // ...Your logic
    //let pReceipt = new PrintReceipt(this.state.reprintReceiptNo, 'coupon');
    this.setState({ dialogVisible: false });
    this.state.printReceipt.print('coupon', this.state.reprintReceiptNo);
  };

  renderItem = ({ index, item }) => {
      return (
        <ListItem icon style={{ marginLeft: 0, flex: 1 }}>
          <Left><Text>{index + 1}.</Text></Left>
          <Body style={{ flex: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ flex: 4 }}>{item.startingCouponNo} <Text style={{ color: 'grey' }}>to</Text> {item.endingCouponNo}</Text>
            <Text style={{ flex: 1 }}>x{item.quantity}</Text>
            <Text style={{ flex: 1 }}>{item.couponType}</Text>
            <Text style={{ flex: 1 }}>{(item.price + item.taxAmount).toFixed(2)}</Text>
          </Body>
          <Right>
            <Button transparent onPress={() => this.deleteItem(item)}>
              <Icon type="Entypo" name="cross" style={{ color: 'red' }} />
            </Button>
          </Right>
        </ListItem>
      );
  };

  onQtyChange(text) {
    this.setState({ qty: text.replace(/[^0-9]/g, '') });
  }

  onStartingNoChange(text) {
    this.setState({ startingCouponNo: text });
  }

  onReprintReceiptNoChange(text) {
    this.setState({ reprintReceiptNo: text });
  }

  recalculateItem(newData){
    return newData.reduce((total, obj) => {
      if (typeof obj['price'] === 'string') {
        return total + Number(obj['price']) + Number(obj['taxAmount']);
      }
      return total + obj['price'] + obj['taxAmount'];
    }, 0);
  }

  deleteItem(value) {
    let newData = _.cloneDeep(this.state.data);
    newData.splice(this.state.data.indexOf(value), 1);

    const total = this.recalculateItem(newData);

    this.setState({ data: newData, total: total.toFixed(2) });
  }

  clearForm() {
    this.setState({
      startingCouponNo: '',
      qty: '',
      data: [],
      total: 0
    });
    this.qty._root.focus();
  }

  reprintReceipt() {
    this.showReprintDialog();
  }

  addItem() {
    if (!COUPON_COLLECTION_ENABLED) { Alert.alert('Coupon sales disabled', COUPON_DISABLED_MESSAGE); return; }
    if (this.state.qty <= 0) {
      this.qty._root.focus();
      Toast.show({
        text: 'Minim Quantiy is 1',
        buttonText: 'OK',
        position: 'top',
        type: 'danger',
        textStyle: { fontSize: 50 },
        duration: 5000
      });

      return;
    } else if (this.state.startingCouponNo === '') {
      Toast.show({
        text: 'Please enter Starting Coupon No.',
        buttonText: 'OK',
        position: 'top',
        type: 'danger',
        textStyle: { fontSize: 50 },
        duration: 5000
      });
      this.startingCouponNo._root.focus();
      return;
    }

    const couponPrefix = this.state.startingCouponNo.replace(/[0-9]/g, '');
    const couponNoWithoutPrefiX = this.state.startingCouponNo.replace(/[^0-9]/g, '');


    let couponFound = [];
    let couponNotFound = [];
    let totalPrice = 0;
    let couponType = 0;
    const coupons = realm.objects('Coupon');
    for (let i = parseInt(couponNoWithoutPrefiX); i < parseInt(couponNoWithoutPrefiX) + parseInt(this.state.qty); i++) {
      let couponNoWithPrefix = couponPrefix + _.padStart(i.toString(), couponNoWithoutPrefiX.length, '0');


      const coupon = coupons.filtered(`couponNo = "${couponNoWithPrefix}"`)[0];
      if (coupon) {
        couponFound.push(couponNoWithPrefix);
        const price = coupon.couponType/100;
        totalPrice += price;
        couponType = coupon.couponType;
      } else {
        couponNotFound.push(couponNoWithPrefix);
      }
    }

    if (couponFound <= 0 ) {
      Alert.alert('Coupon No Not Found');
      return;
    }

    if (couponNotFound.length > 0) {
      Alert.alert(`${couponNotFound.toString()} Not Found!`);
    } else {
      const endingCoupongNo = couponFound[couponFound.length - 1];
      let newData = _.cloneDeep(this.state.data);
      newData.push({
        startingCouponNo: this.state.startingCouponNo,
        endingCouponNo: endingCoupongNo,
        quantity: this.state.qty,
        couponType: couponType,
        price: totalPrice,
        taxAmount: (totalPrice * this.props.generalStore.Tax) / 100
      });

      const total = bnmRound(this.recalculateItem(newData));

      this.setState({
        data: newData,
        total: total
      });
    }
  }

  processPayment() {
    if (!COUPON_COLLECTION_ENABLED) { Alert.alert('Coupon sales disabled', COUPON_DISABLED_MESSAGE); return; }
    if (this.state.data.length <= 0) {
      Toast.show({
        text: 'Purchase Item List is empty!',
        buttonText: 'OK',
        position: 'top',
        type: 'danger',
        textStyle: { fontSize: 50 },
        duration: 5000
      });

      this.qty._root.focus();

      return;
    }

    const generalProfile = realm.objects('GeneralProfile')[0];
    let newReceiptNo;
    try {
      assertNoRemovedSale(realm,'coupon',this.state.city,this.state.data);
      newReceiptNo=nextOtherReceiptCounter(realm,generalProfile,'coupon');
    } catch(error) {Alert.alert('Payment not saved',error.message);return;}
    const couponReceiptNo = generalProfile.CouponReceiptPrefix + '-' + generalProfile.PondokId + '-' + newReceiptNo;

    realm.write(() => {
      //CREATE RECEIPT HEADER
      const couponReceipt = realm.create('CouponReceiptHeader', {
        receiptNo: couponReceiptNo,
        userName: this.props.authStore.userName,
        receiptDate: new Date(),
        pondokId: this.props.generalStore.PondokId
      });

      //CREATE RECEIPT ITEM
      this.state.data.forEach((item) => {
        couponReceipt.items.push({
          startingCouponNo: item.startingCouponNo,
          endingCouponNo: item.endingCouponNo,
          couponType: item.couponType.toString(),
          taxAmount: item.taxAmount,
          amount: item.price,
          tax: this.props.generalStore.Tax
        });
      });

      //UPDATE LATEST RECEIPT NO
      generalProfile.CouponReceiptNo = newReceiptNo;

      this.state.reprintReceiptNo = couponReceiptNo;

      this.state.printReceipt.print('coupon', couponReceiptNo);

      //DELETE SOLD COUPON

      this.state.data.forEach((item) => {
        const couponPrefix = this.state.startingCouponNo.replace(/[0-9]/g, '');
        let startingCouponNoWithoutPrefiX = item.startingCouponNo.replace(/[^0-9]/g, '');
        let endingCouponNoWithoutPrefiX = item.startingCouponNo.replace(/[^0-9]/g, '');

        for (let i = startingCouponNoWithoutPrefiX; i <= endingCouponNoWithoutPrefiX; i++) {
          const couponNoWithPrefix = couponPrefix + i.toString().padStart(i.length, '0');
          const coupon = realm.objects('Coupon').filtered(`couponNo = "${couponNoWithPrefix}"`);
          realm.delete(coupon);
        }
      });

      this.clearForm();
    });
  }

  render() {
    return (
      <Container style={styles.containerStyle}>
        <Grid>
          <Row style={{flex: 0, padding: 12}}><Text testID="coupon-disabled-notice">{COUPON_DISABLED_MESSAGE}</Text></Row>
          <Row style={{ padding: moderateScale(0) }}>
            <Col style={{ flex:4, padding: moderateScale(3) }}>
              <Card >
                <CardItem style={{ flex: 1 }}>
                  <Card style={{ flex: 1 }}>
                    <CardItem header bordered style={{ height: moderateScale(10) }}>
                      <Text style={{ fontSize: moderateScale(10) }}>Purchase Item List</Text>
                    </CardItem>
                    <CardItem style={{ flex: 1, alignItems: 'flex-start' }}>
                      <ScrollView>
                        <List>
                          <ListItem icon style={{ marginLeft: 0, flex: 1, height: moderateScale(10) }}>
                            <Left><Text>#</Text></Left>
                            <Body style={{ flex: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                              <Text style={{ flex: 4, fontSize: moderateScale(10) }}>Coupon No.</Text>
                              <Text style={{ flex: 1, fontSize: moderateScale(10) }}>Qty</Text>
                              <Text style={{ flex: 1, fontSize: moderateScale(10) }}>Type</Text>
                              <Text style={{ flex: 1, fontSize: moderateScale(10) }}>Price</Text>
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
                            keyExtractor={item => item.startingCouponNo}
                          />
                        </List>
                      </ScrollView>
                    </CardItem>
                    <CardItem bordered footer style={{ height: moderateScale(40) }}>
                      <Left style={{ flex: 1 }}>
                        <Button testID="coupon-pay" disabled={!COUPON_COLLECTION_ENABLED} iconLeft small rounded full success style={{ flex: 1 }} onPress={this.processPayment.bind(this)}>
                          <Icon type="FontAwesome" name='money' />
                          <Text>Pay</Text>
                        </Button>
                      </Left>
                      <Right style={{ flex: 2 }}><Text style={{ fontSize: moderateScale(30), fontWeight: 'bold', color: 'darkred' }}>{this.state.total}</Text></Right>
                    </CardItem>
                  </Card>
                </CardItem>
              </Card>
            </Col>
            <Col style={{ flex: 2, padding: moderateScale(3) }}>
              <Card>
                <CardItem >
                  <Item floatingLabel>
                    <Label style={{ fontSize: moderateScale(10) }}>Quantity(s)</Label>
                    <Input
                      testID="coupon-quantity" editable={COUPON_COLLECTION_ENABLED}
                      getRef={(c) => { this.qty = c; }}
                      keyboardType='numeric'
                      //autoFocus={true}
                      value={this.state.qty}
                      style={{ fontSize: moderateScale(10) }}
                      onChangeText={(text) => { this.onQtyChange(text); }}
                    />
                  </Item>
                </CardItem>
                <CardItem>
                  <Item floatingLabel>
                    <Label style={{ fontSize: moderateScale(10) }}>Starting Coupon No.</Label>
                    <Input
                      testID="coupon-starting-number" editable={COUPON_COLLECTION_ENABLED}
                      getRef={(c) => { this.startingCouponNo = c; }}
                      value={this.state.startingCouponNo}
                      style={{ fontSize: moderateScale(10) }}
                      onChangeText={(text) => { this.onStartingNoChange(text); }}
                      autoCapitalize="characters"
                    />
                  </Item>
                </CardItem>
                <CardItem bordered style={{ flex: 1, flexDirection: 'row', justifyContent: 'space-between' }}>

                  <Button testID="coupon-add" disabled={!COUPON_COLLECTION_ENABLED} iconLeft full block primary onPress={this.addItem.bind(this)}>
                    <Icon name='md-add' />
                    <Text>Add</Text>
                  </Button>

                  <Button iconLeft full block warning onPress={this.clearForm.bind(this)}>
                    <Icon type="MaterialIcons" name='clear' />
                    <Text>Clear</Text>
                  </Button>

                </CardItem>
                <CardItem>
                  <Button testID="coupon-reprint" iconLeft full block primary onPress={this.reprintReceipt.bind(this)}>
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
          >

          </Dialog.Input>
          <Dialog.Button label="Cancel" onPress={this.handleCancel} />
          <Dialog.Button label="Print" onPress={this.handleReprint} />
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
