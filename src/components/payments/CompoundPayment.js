import React, { Component } from 'react';
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
  Item,
  Label,
  Icon,
  Footer,
  FooterTab,
  Button,
  List,
  ListItem,
  Right,
  Input,
  Left,
  Picker,
  Toast,
  CheckBox,
  DatePicker
} from 'native-base';
import { Alert, FlatList, ScrollView } from 'react-native';
import { moderateScale } from "../../scaling";
import PrintReceipt from "../../printReceipt";
import { inject, observer } from "mobx-react/index";
import Dialog from "react-native-dialog";
import realm from '../../realm';
import {savePaReceipt, latestPaReceipt} from '../../payments/paReceipts';
import {collectReceipt, reprintSavedReceipt} from '../../payments/collectReceipt';
import {readHolidayCalendar} from '../../payments/holidayCalendar';
import {compoundDiscountPercent} from '../../payments/compoundDiscount';
import {PaymentFormLayout, PaymentDateField, PaymentInput, PaymentFooter, RemoveNoticeButton, paymentFormStyles as styles} from './shared/PaymentForm';
import { getOpPayableDate, bnmRound } from "../../helpers";
import _ from 'lodash';
import moment from 'moment';

@inject('generalStore', 'authStore') @observer
export default class CompoundPayment extends Component {

  constructor() {
    super();
    const cities = realm.objects('City');

    const pa = latestPaReceipt(realm, 'compound');
    let lastReceiptNo = '';
    if (pa) {
      lastReceiptNo = pa.receiptNo;
    }



    this.state = {
      data: [],
      cityData: cities,
      city: cities[0]?cities[0].code:'',
      offences: [],
      offence: '',
      paAmount: '',
      paDate: '',
      paNo: '',
      total: 0,
      dialogVisible: false,
      reprintReceiptNo: lastReceiptNo,
      printReceipt: new PrintReceipt(),
      enableCity: true,
      enableCarNo: true,
      enableReminderNo: true,
      amountReceived: '',
      carNo: '',
      reminderNo: ''
    };
  }

  componentDidMount() {
    this.loadOffence();
  }

  componentDidUpdate(nextProps, nextState) {
    if (this.state.data !== nextState.data) {
      if (this.state.data.length > 0) {
        this.setState({ enableCity: false });
        this.setState({ enableCarNo: false });
        this.setState({ enableReminderNo: false });
      } else {
        this.setState({ enableCity: true });
        this.setState({ enableCarNo: true });
        this.setState({ enableReminderNo: true });
      }
    }
  }

  showReprintDialog() {
    this.setState({ dialogVisible: true });
  }

  handleCancel = () => {
    this.setState({ dialogVisible: false });
  };

  handleReprint = async () => {
    this.setState({dialogVisible: false});
    try {
      await reprintSavedReceipt(this, 'pa', this.state.reprintReceiptNo);
    } catch (error) { Alert.alert(`Unable to print: ${error.message}. Receipt remains saved.`); }
  };


  processPayment() {
    return collectReceipt(this, realm, true, 'pa', (receiptNo, profile) => {
      const holidays = readHolidayCalendar(realm).dates;
      this.state.data.forEach(item => {
        const offence = Array.from(realm.objects('Offence')).find(row => row.code === item.offence && row.city === this.state.city);
        if (compoundDiscountPercent(offence, item.paDate, new Date(), holidays) !== item.disPercent)
          throw new Error('Discount period or holiday settings changed. Re-enter the compounds.');
      });
      savePaReceipt(realm, {
        receiptNo, userName: this.props.authStore.userName, receiptDate: new Date(),
        pondokId: profile.PondokId, city: this.state.city, carNo: this.state.carNo,
        paType: this.state.reminderNo.trim() ? 'R' : 'C', reminderNo: this.state.reminderNo
      }, this.state.data.map(item => ({
        paNo: item.paNo, paDate: item.paDate, offence: item.offence, amount: item.price,
        taxAmount: item.taxAmount, tax: 0, carNo: item.carNo,
        disAmount: item.disAmount, disPercent: item.disPercent
      })));
    });
  }

  deleteButton(item) {
    if (item.opNo !== 'Overdue Charges') {
      return (
        <Button transparent onPress={() => this.deleteItem(item)}>
          <Icon type="Entypo" name="cross" style={{ color: 'red' }} />
        </Button>
      );
    }

    return (
      <Button transparent onPress={() => this.deleteItem(item)} disabled>
        <Icon type="Entypo" name="cross" style={{ color: 'grey' }} />
      </Button>
    );
  }

  renderItem = ({ index, item }) => {

    return (
      <ListItem icon style={{ marginLeft: 0, flex: 1 }}>
        <Left><Text style={{ fontSize: moderateScale(6) }}>{index + 1}.</Text></Left>
        <Body style={{ flex: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ flex: 3, fontSize: moderateScale(6) }}>{item.paNo}</Text>
        <Text style={{ flex: 2, fontSize: moderateScale(6) }}>{moment(item.paDate).format('DD/MM/YYYY')}</Text>
        <Text style={{ flex: 2, fontSize: moderateScale(6) }}>{item.offence}</Text>
        <Text style={{ flex: 2, fontSize: moderateScale(6), textAlign: 'right' }}>{(item.price - item.disAmount).toFixed(2)}</Text>
        </Body>
        <Right>
          {this.deleteButton(item)}
        </Right>
      </ListItem>
    );
  };

  addItem() {

    if (this.state.paNo === '') {
      Toast.show({
        text: 'Please enter PA No.',
        buttonText: 'OK',
        position: 'top',
        type: 'danger',
        textStyle: { fontSize: 30 },
        duration: 5000
      });

      return;
    }

    if (this.state.carNo === '') {
      Toast.show({
        text: 'Please enter Car No.',
        buttonText: 'OK',
        position: 'top',
        type: 'danger',
        textStyle: { fontSize: 30 },
        duration: 5000
      });

      return;
    }

    if (this.state.paDate === '') {
      Toast.show({
        text: 'Please select a PA Date.',
        buttonText: 'OK',
        position: 'top',
        type: 'danger',
        textStyle: { fontSize: 30 },
        duration: 5000
      });

      return;
    }

    for (let item of this.state.data) {
      if (item.paNo === this.state.paNo) {
        Toast.show({
          text: 'PA No. already exist!',
          buttonText: 'OK',
          position: 'top',
          type: 'danger',
          textStyle: { fontSize: 30 },
          duration: 5000
        });
        return;
      }
    }

    let newData = _.cloneDeep(this.state.data);

    const offence = realm.objects('Offence').filtered(`city = "${this.state.city}" AND code = "${this.state.offence}"`)[0];
    let disPercent;
    try { disPercent = compoundDiscountPercent(offence, this.state.paDate, new Date(), readHolidayCalendar(realm).dates); }
    catch (error) {
      Toast.show({text: error.message, buttonText: 'OK', position: 'top', type: 'danger', duration: 5000});
      return;
    }
    const disAmount = bnmRound(this.state.paAmount * disPercent / 100);

    newData.push({
      paNo: this.state.paNo,
      city: this.state.city,
      offence: this.state.offence,
      price: parseFloat(this.state.paAmount),
      paDate: this.state.paDate,
      disPercent: parseFloat(disPercent),
      disAmount: parseFloat(disAmount),
      //taxAmount: (this.state.paAmount * this.props.generalStore.Tax) / 100
      taxAmount: 0
    });
    console.log('hey')

    const total = this.recalculateItem(newData);

    this.setState({
      data: newData,
      total: total.toFixed(2),
      paNo: ''
    });
  }

  loadOffence() {
    const offences = realm.objects('Offence').filtered(`city = "${this.state.city}"`).sorted('description', true);
    this.setState({ offences: offences, offence: offences[0]?offences[0].code:'' }, () => {
      this.setOffenceAmount();
    });
  }

  onCityChange(text) {
    this.setState({ city: text }, () => {
      this.loadOffence();
    });
  }

  onPaDateChange(text) {
    this.setState({ paDate: text });
  }

  onReminderNoChange(text) {
    this.setState({ reminderNo: text });
  }

  onCarNoChange(text) {
    this.setState({ carNo: text });
  }

  onPaNoChange(text) {
    this.setState({ paNo: text });
  }

  onReprintReceiptNoChange(text) {
    this.setState({ reprintReceiptNo: text });
  }

  onAmountReceivedChange(text) {
    this.setState({ amountReceived: text });
  }

  setOffenceAmount() {
    let paAmount = '';
    const offence = realm.objects('Offence').filtered(`city = "${this.state.city}" AND code = "${this.state.offence}"`)[0];
    this.setState({ paAmount: offence?offence.amount:'' });
  }

  onOffenceChange(text) {
    this.setState({ offence: text }, () => {
      this.setOffenceAmount();
    });
  }

  recalculateItem(newData){
    return newData.reduce((total, obj) => {
      if (typeof obj['price'] === 'string') {
        return total + Number(obj['price']) - Number(obj['disAmount']);
      }
      return total + obj['price'] - obj['disAmount'];
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
      opNo: '',
      data: [],
      total: 0,
      amountReceived: '',
      overdue: false,
      carNo: '',
      reminderNo: ''
    });
  }

  reprintReceipt() {
    this.showReprintDialog();
  }

  render() {
    const saving=!!this.state.saving;
    const configured=!!this.state.offence&&Number(this.state.paAmount)>0;
    const list=<React.Fragment>
      <Row style={styles.tableRow}><Text style={styles.index}>#</Text><Text style={styles.number}>PA No.</Text><Text style={styles.date}>PA Date</Text><Text style={styles.date}>Offence</Text><Text style={styles.amount}>Amount</Text><Text style={styles.remove}> </Text></Row>
      {this.state.data.map((item,index)=><Row key={item.paNo} style={[styles.tableRow,styles.item]}>
        <Text style={styles.index}>{index+1}.</Text><Text style={styles.number}>{item.paNo}</Text>
        <Text style={styles.date}>{moment(item.paDate).format('DD/MM/YYYY')}</Text><Text style={styles.date}>{item.offence}</Text>
        <Text style={styles.amount}>{(item.price-item.disAmount).toFixed(2)}</Text>
        <RemoveNoticeButton prefix="compound" noticeNo={item.paNo} disabled={saving} onPress={()=>this.deleteItem(item)}/>
      </Row>)}
      {!configured&&<Text style={styles.message}>Load configured compound offences and amounts from the office.</Text>}
    </React.Fragment>;
    const entry=<React.Fragment>
      <Picker testID="compound-city" style={{height:40}} enabled={!saving&&this.state.enableCity} selectedValue={this.state.city} onValueChange={value=>this.onCityChange(value)}>
        {this.state.cityData.map(city=><Picker.Item key={city.code} label={city.code} value={city.code}/>)}</Picker>
      <PaymentInput prefix="compound" field="carNo" label="Car No." value={this.state.carNo} editable={!saving&&this.state.enableCarNo} onChange={value=>this.onCarNoChange(value)}/>
      <PaymentInput prefix="compound" field="reminderNo" label="Reminder No. (optional)" value={this.state.reminderNo} editable={!saving&&this.state.enableReminderNo} onChange={value=>this.onReminderNoChange(value)}/>
      <PaymentInput prefix="compound" field="paNo" label="PA No." value={this.state.paNo} editable={!saving&&configured} onChange={value=>this.onPaNoChange(value)}/>
      <PaymentDateField prefix="compound" label="PA date" value={this.state.paDate} disabled={saving} minimumDate={new Date(2000,1,1)} onChange={date=>this.onPaDateChange(date)}/>
      <Picker testID="compound-offence" style={{height:40}} enabled={!saving} selectedValue={this.state.offence} onValueChange={value=>this.onOffenceChange(value)}>
        {this.state.offences.map(offence=><Picker.Item key={offence.code} label={offence.code} value={offence.code}/>)}</Picker>
      {configured&&<Text testID="compound-configured-rate" style={styles.small}>Amount RM {Number(this.state.paAmount).toFixed(2)}</Text>}
      <Row style={{marginTop:8}}><Col style={{paddingRight:5}}><Button testID="compound-add" iconLeft full block primary disabled={saving||!configured} onPress={this.addItem.bind(this)}><Icon name="md-add"/><Text>Add</Text></Button></Col>
        <Col style={{paddingLeft:5}}><Button testID="compound-clear" iconLeft full block warning disabled={saving} onPress={this.clearForm.bind(this)}><Icon type="MaterialIcons" name="clear"/><Text>Clear</Text></Button></Col></Row>
      <Button testID="compound-reprint" iconLeft full block primary style={{marginTop:8}} disabled={saving} onPress={this.reprintReceipt.bind(this)}><Icon name="md-print"/><Text>Reprint Receipt</Text></Button>
    </React.Fragment>;
    return <PaymentFormLayout prefix="compound" title="Compound" items={list} entry={entry}
      footer={<PaymentFooter prefix="compound" total={this.state.total} received={this.state.amountReceived} onReceived={value=>this.onAmountReceivedChange(value)} pay={this.processPayment.bind(this)} saving={saving} disabled={!this.state.data.length}/>}>
      <Dialog.Container visible={this.state.dialogVisible}><Dialog.Title>Reprint Receipt</Dialog.Title>
        <Dialog.Input label="Receipt No." value={this.state.reprintReceiptNo} onChangeText={value=>this.onReprintReceiptNoChange(value)}/>
        <Dialog.Button label="Cancel" onPress={this.handleCancel}/><Dialog.Button label="Print" onPress={this.handleReprint}/>
      </Dialog.Container>
    </PaymentFormLayout>;
  }
}
