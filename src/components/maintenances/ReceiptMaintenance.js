import {receiptRemovalRows,cleanupPreviouslyUploaded} from '../../payments/receiptRemoval';
import {reviewReceiptRemoval, reviewReceiptRestore} from '../../payments/receiptRemovalUI';
import React, { Component } from 'react';
import { Alert } from 'react-native';
import {
  Container,
  Content,
  Card,
  CardItem,
  Body,
  Button,
  Icon,
  Text,
  View, Toast,
} from 'native-base';
import realm from '../../realm';
import {paMaintenanceRows} from '../../payments/paMaintenance';
import {opMaintenanceRows} from '../../payments/opMaintenance';
import { Actions } from 'react-native-router-flux';
import { inject, observer } from 'mobx-react/index';

@inject('generalStore', 'authStore') @observer
export default class ReceiptMaintenance extends Component {

  constructor(props) {
    super(props);

    const couponReceiptCount = realm.objects('CouponReceiptHeader').length;
    const opReceiptCount = opMaintenanceRows(realm).length;
    const mBillReceiptCount = realm.objects('MBillReceiptHeader').length;
    //const opReceiptCount = opMaintenanceRows(realm).length;
    const paReceiptCount = paMaintenanceRows(realm).length;
    this.state = {
      couponReceiptCount,
      opReceiptCount,
      paReceiptCount,
      mBillReceiptCount,
      removedReceipts: [],
    };
  }

  componentWillMount() {
    if (this.props.authStore.level != 0) {
      Alert.alert('Permission Denied!', 'You do not have enough access!');
      Actions.pop();
    }
  }

  refreshReceipts() {
    this.setState({opReceiptCount:opMaintenanceRows(realm).length,paReceiptCount:paMaintenanceRows(realm).length,
      couponReceiptCount:realm.objects('CouponReceiptHeader').length,mBillReceiptCount:realm.objects('MBillReceiptHeader').length,
      removedReceipts:Array.from(realm.objects('ReceiptRemovalArchive')).map(row=>({id:row.id,kind:row.kind,receiptNo:row.receiptNo,uploaded:row.removedBy==='office-upload-confirmed'}))});
  }
  componentDidMount() {
    cleanupPreviouslyUploaded(realm);
    this._receiptListener=()=>this.refreshReceipts();
    if(realm.addListener)realm.addListener('change',this._receiptListener);
    this.refreshReceipts();
  }
  componentWillUnmount() {if(realm.removeListener&&this._receiptListener)realm.removeListener('change',this._receiptListener);}
  componentWillReceiveProps() { this.refreshReceipts(); }
  removeGroup(group) {reviewReceiptRemoval(this,realm,receiptRemovalRows(realm,group),()=>this.refreshReceipts());}
  deleteOpReceipts() {this.removeGroup('op');}
  deletePaReceipts() {this.removeGroup('pa');}
  deleteCouponReceipts() {this.removeGroup('coupon');}
  deleteMBillReceipts() {this.removeGroup('mbill');}

  render() {
    return (
      <Container style={{ flex: 1 }}>
        <Content>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Card style={{ width: 500 }}>
              <CardItem header bordered style={{ justifyContent: 'center' }}>
                <Text>Coupon Receipt</Text>
              </CardItem>
              <CardItem bordered>
                <Body style={{ flex: 1, alignItems: 'center' }}>
                  <Text style={{ fontSize: 50 }}>{this.state.couponReceiptCount}</Text>
                  <Text style={{ fontSize: 12, color: 'grey' }}>Total Record</Text>
                </Body>
              </CardItem>
              <CardItem footer bordered style={{ justifyContent: 'space-evenly' }}>
                <Button onPress={() => { this.deleteCouponReceipts(); }}>
                  <Icon type="Ionicons" name="ios-trash-outline" />
                  <Text>Delete</Text>
                </Button>

                <Button onPress={() => { Actions.couponReceiptViewMaintenance(); }}>
                  <Icon type="Ionicons" name="ios-eye-outline" />
                  <Text>View</Text>
                </Button>
              </CardItem>
            </Card>

            <Card style={{ width: 500 }}>
              <CardItem header bordered style={{ justifyContent: 'center' }}>
                <Text>PA Receipt / Overdue AN / Overdue OP</Text>
              </CardItem>
              <CardItem bordered>
                <Body style={{ flex: 1, alignItems: 'center' }}>
                <Text style={{ fontSize: 50 }}>{this.state.paReceiptCount}</Text>
                <Text style={{ fontSize: 12, color: 'grey' }}>Total Record</Text>
                </Body>
              </CardItem>
              <CardItem footer bordered style={{ justifyContent: 'space-evenly' }}>
                <Button onPress={() => { this.deletePaReceipts(); }}>
                  <Icon type="Ionicons" name="ios-trash-outline" />
                  <Text>Delete all PA / overdue receipts</Text>
                </Button>

                <Button onPress={() => { Actions.paReceiptViewMaintenance(); }}>
                  <Icon type="Ionicons" name="ios-eye-outline" />
                  <Text>View</Text>
                </Button>
              </CardItem>
            </Card>

            <Card style={{ width: 500 }}>
              <CardItem header bordered style={{ justifyContent: 'center' }}>
                <Text>OP / AN Receipt</Text>
              </CardItem>
              <CardItem bordered>
                <Body style={{ flex: 1, alignItems: 'center' }}>
                <Text style={{ fontSize: 50 }}>{this.state.opReceiptCount}</Text>
                <Text style={{ fontSize: 12, color: 'grey' }}>Total Record</Text>
                </Body>
              </CardItem>
              <CardItem footer bordered style={{ justifyContent: 'space-evenly' }}>
                <Button onPress={() => { this.deleteOpReceipts(); }}>
                  <Icon type="Ionicons" name="ios-trash-outline" />
                  <Text>Delete all OP / AN receipts</Text>
                </Button>

                <Button onPress={() => { Actions.opReceiptViewMaintenance(); }}>
                  <Icon type="Ionicons" name="ios-eye-outline" />
                  <Text>View</Text>
                </Button>
              </CardItem>
            </Card>

            <Card style={{ width: 500 }}>
              <CardItem header bordered style={{ justifyContent: 'center' }}>
                <Text>MBill Receipt</Text>
              </CardItem>
              <CardItem bordered>
                <Body style={{ flex: 1, alignItems: 'center' }}>
                <Text style={{ fontSize: 50 }}>{this.state.mBillReceiptCount}</Text>
                <Text style={{ fontSize: 12, color: 'grey' }}>Total Record</Text>
                </Body>
              </CardItem>
              <CardItem footer bordered style={{ justifyContent: 'space-evenly' }}>
                <Button onPress={() => { this.deleteMBillReceipts(); }}>
                  <Icon type="Ionicons" name="ios-trash-outline" />
                  <Text>Delete</Text>
                </Button>

                <Button onPress={() => { Actions.mBillReceiptViewMaintenance(); }}>
                  <Icon type="Ionicons" name="ios-eye-outline" />
                  <Text>View</Text>
                </Button>
              </CardItem>
            </Card>
            <Card style={{width:500}}>
              <CardItem header><Text>Receipt history (not active)</Text></CardItem>
              <CardItem><Text>Uploaded receipts are kept here only as history, not in the upload queue. Ask Office for uploaded reprints. Other locally removed receipts can be restored. Removal never cancels an Office payment.</Text></CardItem>
              {(this.state.removedReceipts||[]).map(row=><CardItem key={row.id}>
                <Text>{row.kind.toUpperCase()} {row.receiptNo}</Text>
                {row.uploaded?<Text>Uploaded to Office</Text>:<Button onPress={()=>reviewReceiptRestore(this,realm,row.id,()=>this.refreshReceipts())}><Text>Restore</Text></Button>}
              </CardItem>)}
            </Card>
          </View>
        </Content>
      </Container>
    );
  }
}

