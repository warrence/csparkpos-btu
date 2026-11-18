import {assertNewOpNotices} from '../../payments/opReceipts';
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
  DatePicker
} from 'native-base';
import { Alert, FlatList, PixelRatio, ScrollView, View } from 'react-native';
import { Actions } from 'react-native-router-flux';
import { moderateScale } from "../../scaling";
import PrintReceipt from "../../printReceipt";
import { inject, observer } from "mobx-react/index";
import Dialog from "react-native-dialog";
import realm from '../../realm';
import {sharedOpnVehicle} from '../../payments/opnVehicle';
import {savePaReceipt, latestPaReceipt} from '../../payments/paReceipts';
import {collectReceipt, reprintSavedReceipt} from '../../payments/collectReceipt';
import {readHolidayCalendar} from '../../payments/holidayCalendar';
import {calendarIsOverdue} from '../../payments/calendarWindow';
import {watchKuchingDay} from '../../payments/dayRollover';
import {configuredOpnRates} from '../../payments/opnRates';
import {noticeTaxCents} from '../../payments/noticeTax';
import {cents} from '../../advice/collection';
import {PaymentFormLayout, PaymentDateField, PaymentInput, PaymentFooter, RemoveNoticeButton, paymentFormStyles as styles} from './shared/PaymentForm';
import { getOpPayableDate } from "../../helpers";
import _ from 'lodash';
import moment from 'moment';
import { bnmRound } from "../../helpers";

@inject('generalStore', 'authStore') @observer
export default class OpnPayment extends Component {

  constructor() {
    super();
    const cities = realm.objects('City');
    const opAmounts = realm.objects('OpTable');
    const normal = Array.from(realm.objects('OpReceiptHeader')).sort((a,b)=>new Date(b.receiptDate)-new Date(a.receiptDate))[0];
    const overdue = latestPaReceipt(realm, 'op');
    const op = !normal ? overdue : !overdue ? normal : new Date(overdue.receiptDate)>new Date(normal.receiptDate) ? overdue : normal;
    let lastReceiptNo = '';
    if (op) {
      lastReceiptNo = op.receiptNo;
    }

    this.state = {
      data: [],
      cityData: cities,
      city: cities[0] ? cities[0].code : '',
      opAmounts: opAmounts,
      opAmount: opAmounts.length > 0 ? opAmounts[0].amount : 0,
      payableDate: [],
      opDate: '',
      opNo: '',
      total: 0,
      dialogVisible: false,
      reprintReceiptNo: lastReceiptNo,
      printReceipt: new PrintReceipt(),
      enableCity: true,
      enableCarNo: true,
      enableReminderNo: false,
      amountReceived: '',
      overdue: false,
      carNo: '',
      reminderNo: ''
    };
  }

  componentDidMount() {
    this.refreshCalendar();
    this._stopDayRefresh = watchKuchingDay(this.refreshDateStatus);
    if (realm.addListener) realm.addListener('change', this.refreshCalendar);
  }

  componentWillUnmount() {
    if (realm.removeListener) realm.removeListener('change', this.refreshCalendar);
    if (this._stopDayRefresh) this._stopDayRefresh();
  }

  refreshCalendar = () => {
    const cities = Array.from(realm.objects('City')).map(row => ({code: row.code,
      opExpiryDay: row.opExpiryDay, expiryPaRate: row.expiryPaRate}));
    let rates=[], rateMessage='';
    try {rates=configuredOpnRates(realm);} catch(error){rateMessage=error.message;}
    let calendar = null;
    try {calendar = readHolidayCalendar(realm);} catch (error) {rateMessage = error.message;}
    const signature = JSON.stringify([cities,calendar,Array.from(realm.objects('OpTable')).map(row=>row.amount)]);
    const changed = this._citySignature && signature !== this._citySignature;
    if (signature === this._citySignature) return;
    this._citySignature = signature;
    const city = cities.some(row => row.code === this.state.city) ? this.state.city : (cities[0] ? cities[0].code : '');
    let payableDate = [], policyMessage = '';
    try { payableDate = getOpPayableDate(city); } catch (error) { policyMessage = error.message; }
    this.setState(this.automaticDatePatch({city, cityData: cities, payableDate, opAmounts:rates.map(amount=>({amount})),
      opAmount:rates.includes(Number(this.state.opAmount))?Number(this.state.opAmount):(rates[0]||0),
      policyMessage: policyMessage || rateMessage ||
      (changed ? 'City settings refreshed. Re-enter selected notices.' : ''),
      ...(changed ? {data: [], total: 0, overdue: false, amountReceived: ''} : {}),
      opDate: changed ? '' : this.state.opDate,
      dateRevision: (this.state.dateRevision || 0) + 1}));
  };

  validateRates(notices) {
    const rates=configuredOpnRates(realm);
    const amounts=notices.length?notices.map(item=>item.price):[Number(this.state.opAmount)];
    if(amounts.some(amount=>!rates.includes(amount)))
      throw new Error('The selected OPN amount is no longer configured. Re-enter the notices.');
    amounts.forEach(amount => noticeTaxCents(cents(amount), this.props.generalStore.Tax));
  }

  validateWindow(notices) {
    const city = Array.from(realm.objects('City')).find(row => row.code === this.state.city);
    const dates = notices.length ? notices.map(item => item.opDate) : [this.state.opDate];
    dates.forEach(date => {
      const overdue = calendarIsOverdue(date, city && city.opExpiryDay, new Date(), readHolidayCalendar(realm).dates);
      if (overdue !== this.state.overdue) throw new Error('Notice status changed. Clear the list and re-enter the notices.');
    });
  }

  componentDidUpdate(nextProps, nextState) {
    if (this.state.data !== nextState.data) {
      const locked = this.selectedNotices().length > 0;
      this.setState({enableCity: !locked, enableCarNo: !(this.state.overdue && locked)});
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
      const saved = realm.objectForPrimaryKey('PaReceiptHeader', this.state.reprintReceiptNo);
      const kind = saved && ['O','RO'].includes(saved.paType) ? 'oc' : 'op';
      await reprintSavedReceipt(this, kind, this.state.reprintReceiptNo);
    } catch (error) { Alert.alert(`Unable to print: ${error.message}. Receipt remains saved.`); }
  };


  selectedNotices() {
    return this.state.data.filter(item => item.opNo !== 'Overdue Charges');
  }

  overdueDateLocked() {
    return this.state.overdue && this.selectedNotices().length > 0;
  }

  processPayment() {
    if (this._saving) return;
    const notices = this.selectedNotices();
    if (!notices.length) { Alert.alert('Payment was not saved: Add an OP notice first.'); return; }
    try { this.validateRates(notices); this.validateWindow(notices); }
    catch (error) { Alert.alert(`Payment was not saved: ${error.message}`); return; }
    if (this.state.overdue && notices.some(item => item.opDate !== this.state.opDate ||
        (item.carNo && item.carNo !== this.state.carNo))) {
      Alert.alert('Payment was not saved: Use one vehicle and notice date per overdue receipt.'); return;
    }
    const fees = this.state.data.filter(item => item.opNo === 'Overdue Charges');
    if (fees.length !== (this.state.overdue ? 1 : 0) || (this.state.overdue && this.state.data[0] !== fees[0])) {
      Alert.alert('Payment was not saved: Clear and re-enter this receipt to restore the overdue charge.'); return;
    }
    const overdue = this.state.overdue;
    return collectReceipt(this, realm, overdue, overdue ? 'oc' : 'op', (receiptNo, profile) => {
      if (!overdue) {
        assertNewOpNotices(realm, this.state.city, notices);
        const receipt = realm.create('OpReceiptHeader', {
          receiptNo, userName: this.props.authStore.userName, receiptDate: new Date(),
          pondokId: profile.PondokId, city: this.state.city, carNo: sharedOpnVehicle(notices), taxPolicyVersion: 3
        });
        this.state.data.forEach(item => receipt.items.push({
          opNo: item.opNo, opDate: item.opDate, carNo: item.carNo || null, taxAmount: item.taxAmount,
          amount: item.price, tax: this.props.generalStore.Tax
        }));
      } else {
        const header = {
          receiptNo, userName: this.props.authStore.userName, receiptDate: new Date(),
          pondokId: profile.PondokId, city: this.state.city, carNo: this.state.carNo,
          paType: this.state.reminderNo.trim() ? 'RO' : 'O', reminderNo: this.state.reminderNo
        };
        const lines=[];
        let overdueCharges = 0;
        this.state.data.forEach(item => {
          if (item.opNo === 'Overdue Charges') overdueCharges = item.price;
          else {
            lines.push({paNo: item.opNo, paDate: item.opDate, offence: 'OPN Overdue',
              amount: overdueCharges, opAmount: item.price, taxAmount: item.taxAmount,
              tax: this.props.generalStore.Tax, carNo: item.carNo, disAmount: 0, disPercent: 0});
            overdueCharges = 0;
          }
        });
        savePaReceipt(realm, header, lines);
      }
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
        <Text style={{ flex: 3, fontSize: moderateScale(6) }}>{item.opNo}</Text>
        <Text style={{ flex: 2, fontSize: moderateScale(6) }}>{moment(item.opDate).format('DD/MM/YYYY')}</Text>
        <Text style={{ flex: 1, fontSize: moderateScale(6) }}>{(item.price + item.taxAmount).toFixed(2)}</Text>
        </Body>
        <Right>
          {this.deleteButton(item)}
        </Right>
      </ListItem>
    );
  };

  recalculateItem(newData){
    return newData.reduce((total, obj) => {
      if (typeof obj['price'] === 'string') {
        return total + Number(obj['price']) + Number(obj['taxAmount']);
      }
      return total + obj['price'] + obj['taxAmount'];
    }, 0);
  }

  addItem() {
    if (this._saving || this.state.saving) return;

    if (this.state.opNo === '') {
      Toast.show({
        text: 'Please enter OP No.',
        buttonText: 'OK',
        position: 'top',
        type: 'danger',
        textStyle: { fontSize: 30 },
        duration: 5000
      });

      return;
    }

    if (this.state.opDate === '') {
      Toast.show({
        text: 'Please select OP Date.',
        buttonText: 'OK',
        position: 'top',
        type: 'danger',
        textStyle: { fontSize: 30 },
        duration: 5000
      });

      return;
    }

    let overdue;
    try {
      overdue = this.computedOverdue();
      if (overdue) {
        const city = Array.from(realm.objects('City')).find(row => row.code === this.state.city);
        cents(city.expiryPaRate, 'Configured OP overdue charge');
      }
      if (this.selectedNotices().length && overdue !== this.state.overdue)
        throw new Error('Use one payment status per receipt. Clear the list before changing dates.');
    } catch (error) { Toast.show({text: error.message, buttonText: 'OK', type: 'danger'}); return; }

    if (overdue && this.state.carNo === '') {
      Toast.show({
        text: 'Car No required for an overdue notice.',
        buttonText: 'OK',
        position: 'top',
        type: 'danger',
        textStyle: { fontSize: 30 },
        duration: 5000
      });

      return;
    }

    if (this.overdueDateLocked() && this.selectedNotices().some(item =>
        item.opDate !== this.state.opDate || item.carNo !== this.state.carNo)) {
      Toast.show({text: 'Use one vehicle and notice date per overdue receipt. Clear the list to change it.',
        buttonText: 'OK', type: 'danger', duration: 5000});
      return;
    }

    try { this.validateRates([]); }
    catch (error) {
      Toast.show({text: error.message, buttonText: 'OK', type: 'danger', duration: 5000}); return;
    }

    for (let item of this.state.data) {
      if (item.opNo === this.state.opNo) {
        Toast.show({
          text: 'OP No. already exist!',
          buttonText: 'OK',
          position: 'top',
          type: 'danger',
          textStyle: {fontSize: 30},
          duration: 5000
        });
        return;
      }
    }



    let newData = this.selectedNotices().length ? _.cloneDeep(this.state.data) :
      this.automaticDatePatch().data;
    if (!newData) { Toast.show({text: 'Load valid payment settings.', type: 'danger'}); return; }
    newData.push({
      opNo: this.state.opNo,
      city: this.state.city,
      price: parseFloat(this.state.opAmount),
      opDate: this.state.opDate,
      carNo: this.state.carNo,
      taxAmount: noticeTaxCents(cents(this.state.opAmount), this.props.generalStore.Tax) / 100
    });


    const total = bnmRound(this.recalculateItem(newData));

    this.setState({
      data: newData,
      overdue,
      total: total,
      opNo: ''
    });
  }

  computedOverdue(date = this.state.opDate, cityCode = this.state.city) {
    const city = Array.from(realm.objects('City')).find(row => row.code === cityCode);
    if (!city) throw new Error('Load city settings before collecting.');
    const overdue = calendarIsOverdue(date, city.opExpiryDay, new Date(), readHolidayCalendar(realm).dates);
    if (overdue) cents(city.expiryPaRate, 'Configured OP overdue charge');
    return overdue;
  }

  automaticDatePatch(next = {}) {
    const state = {...this.state, ...next};
    const notices = state.data.filter(item => item.opNo !== 'Overdue Charges');
    let overdue = null, message = '';
    try { overdue = this.computedOverdue(state.opDate, state.city); }
    catch (error) { message = error.message; }
    if (notices.length) {
      try { this.validateWindow(notices); }
      catch (error) { message = 'Notice status changed. Clear the list and re-enter the notices.'; }
      if (overdue !== null && overdue !== state.overdue)
        message = 'Use one payment status per receipt. Clear the list before changing dates.';
      return {...next, policyMessage: next.policyMessage || message || ''};
    }
    let data = [];
    if (overdue) {
      try {
        const city = Array.from(realm.objects('City')).find(row => row.code === state.city);
        const charge = cents(city.expiryPaRate, 'Configured OP overdue charge') / 100;
        data = [{opNo: 'Overdue Charges', city: state.city, price: charge, opDate: '', taxAmount: 0}];
      } catch (error) { overdue = null; message = error.message; }
    }
    return {...next, overdue: overdue === true, data, total: this.recalculateItem(data).toFixed(2),
      enableReminderNo: overdue === true, policyMessage: next.policyMessage || message || ''};
  }

  refreshDateStatus = () => {
    if (!this._saving && !this.state.saving) this.setState(this.automaticDatePatch());
  };

  onCityChange(text) {
    if (this._saving || this.state.saving || this.selectedNotices().length) return;
    let payableDate = [], policyMessage = '';
    try { payableDate = getOpPayableDate(text); } catch (error) { policyMessage = error.message; }
    this.setState(this.automaticDatePatch({city: text, payableDate, policyMessage}));
  }

  onCarNoChange(text) {
    if (this._saving || this.state.saving || this.overdueDateLocked()) return;
    this.setState({ carNo: text });
  }

  onReminderNoChange(text) {
    this.setState({ reminderNo: text });
  }

  onOpAmountChange(text) {
    if(this._saving||this.state.saving)return;
    try {
      if(!configuredOpnRates(realm).includes(Number(text)))throw new Error('Select a configured OPN amount.');
      this.setState({opAmount:Number(text)});
    } catch(error){this.setState({policyMessage:error.message});}
  }

  onOpNoChange(text) {
    this.setState({ opNo: text });
  }

  onOpDateChange(text) {
    if (this._saving || this.state.saving || this.overdueDateLocked()) return;
    const date = typeof text === 'string' ? text : moment(text).format('YYYY-MM-DD');
    this.setState(this.automaticDatePatch({opDate: date}));
  }

  onReprintReceiptNoChange(text) {
    this.setState({ reprintReceiptNo: text });
  }

  onAmountReceivedChange(text) {
    this.setState({ amountReceived: text });
  }

  recalculateItem(newData) {
    return newData.reduce((total, obj) => {
      if (typeof obj['price'] === 'string') {
        return total + Number(obj['price']) + Number(obj['taxAmount']);
      }
      return total + obj['price'] + obj['taxAmount'];
    }, 0);
  }

  renderDatePicker() {
    let payableDate=[];
    try {payableDate=getOpPayableDate(this.state.city);} catch(error){/* Collection stays disabled. */}
    return <PaymentDateField prefix="opn" label="OP date" value={this.state.opDate}
      revision={this.state.dateRevision}
      disabled={!!this.state.saving||!payableDate.length||this.overdueDateLocked()}
      onChange={date=>this.onOpDateChange(date)}/>;
  }

  deleteItem(value) {
    if (this._saving || this.state.saving || value.opNo === 'Overdue Charges') return;
    const newData = this.state.data.filter(item => item !== value);
    const total = bnmRound(this.recalculateItem(newData));
    this.setState(this.automaticDatePatch({data: newData, total: Number(total).toFixed(2)}));
  }

  clearForm() {
    // collectReceipt calls this after committing while its save lock is held.
    this.setState({
      opNo: '', data: [], total: 0, amountReceived: '', overdue: false,
      carNo: '', reminderNo: '', enableCity: true, enableCarNo: true, enableReminderNo: false,
      opDate: '',
      dateRevision: (this.state.dateRevision || 0) + 1,
      opAmount: this.state.opAmounts.length > 0 ? this.state.opAmounts[0].amount : 0
    });
  }

  reprintReceipt() {
    this.showReprintDialog();
  }

  render() {
    let configured=true,rates=[],rateLabels=[],configurationMessage='';
    try {
      getOpPayableDate(this.state.city);rates=configuredOpnRates(realm);
      rateLabels=rates.map(amount=>((cents(amount)+noticeTaxCents(cents(amount),this.props.generalStore.Tax))/100).toFixed(2));
    }catch(error){configured=false;configurationMessage=error.message;}
    const saving=!!this.state.saving,notices=this.selectedNotices(),locked=notices.length>0;
    let draftStatus = null, basketValid = true;
    try { draftStatus = this.computedOverdue(); } catch (error) {}
    try { this.validateWindow(notices); } catch (error) { basketValid = false; }
    const canAdd = draftStatus !== null && (!locked || draftStatus === this.state.overdue);
    const list=<React.Fragment>
      <Row style={styles.tableRow}><Text style={styles.index}>#</Text><Text style={styles.number}>OP No.</Text><Text style={styles.date}>OP Date</Text><Text style={styles.amount}>Amount</Text><Text style={styles.remove}> </Text></Row>
      {this.state.data.map((item,index)=><Row key={item.opNo} style={[styles.tableRow,styles.item]}>
        <Text style={styles.index}>{index+1}.</Text><Text style={styles.number}>{item.opNo}</Text>
        <Text style={styles.date}>{item.opDate?moment(item.opDate).format('DD/MM/YYYY'):''}</Text>
        <Text style={styles.amount}>{(Number(item.price)+Number(item.taxAmount||0)).toFixed(2)}</Text>
        <RemoveNoticeButton prefix="opn" noticeNo={item.opNo} disabled={saving||item.opNo==='Overdue Charges'} onPress={()=>this.deleteItem(item)}/>
      </Row>)}
      {!!(configurationMessage||this.state.policyMessage)&&<Text style={styles.message}>{configurationMessage||this.state.policyMessage}</Text>}
    </React.Fragment>;
    const entry=<React.Fragment>
      <Text testID="opn-status" style={styles.small}>{draftStatus === null ? 'Select a valid notice date.' : draftStatus ? 'Overdue' : 'Normal'}</Text>
      <Picker testID="opn-city" style={{height:40}} enabled={!saving&&!locked} selectedValue={this.state.city} onValueChange={value=>this.onCityChange(value)}>
        {this.state.cityData.map(city=><Picker.Item key={city.code} label={city.code} value={city.code}/>)}</Picker>
      <PaymentInput prefix="opn" field="carNo" label="Car No." value={this.state.carNo} editable={!saving&&!this.overdueDateLocked()} onChange={value=>this.onCarNoChange(value)}/>
      <PaymentInput prefix="opn" field="reminderNo" label="Reminder No. (optional)" value={this.state.reminderNo} editable={!saving&&this.state.overdue} onChange={value=>this.onReminderNoChange(value)}/>
      <PaymentInput prefix="opn" field="opNo" label="OP No." value={this.state.opNo} editable={!saving&&configured} onChange={value=>this.onOpNoChange(value)}/>
      {this.renderDatePicker()}
      {configured&&rates.length===1&&<Text testID="opn-configured-rate" style={styles.small}>Amount RM {rateLabels[0]}</Text>}
      {configured&&rates.length>1&&<Picker testID="opn-rate-picker" style={{height:40}} enabled={!saving} selectedValue={this.state.opAmount} onValueChange={value=>this.onOpAmountChange(value)}>
        {rates.map((amount,index)=><Picker.Item key={amount} label={`RM ${rateLabels[index]}`} value={amount}/>)}</Picker>}
      <Row style={{marginTop:8}}><Col style={{paddingRight:5}}><Button testID="opn-add" iconLeft full block primary disabled={saving||!configured||!canAdd} onPress={this.addItem.bind(this)}><Icon name="md-add"/><Text>Add</Text></Button></Col>
        <Col style={{paddingLeft:5}}><Button testID="opn-clear" iconLeft full block warning disabled={saving} onPress={this.clearForm.bind(this)}><Icon type="MaterialIcons" name="clear"/><Text>Clear</Text></Button></Col></Row>
      <Button testID="opn-reprint" iconLeft full block primary style={{marginTop:8}} disabled={saving} onPress={this.reprintReceipt.bind(this)}><Icon name="md-print"/><Text>Reprint Receipt</Text></Button>
    </React.Fragment>;
    return <PaymentFormLayout prefix="opn" title={`OPN ${this.state.overdue?'(Overdue)':''}`} items={list} entry={entry}
      footer={<PaymentFooter prefix="opn" total={this.state.total} received={this.state.amountReceived} onReceived={value=>this.onAmountReceivedChange(value)} pay={this.processPayment.bind(this)} saving={saving} disabled={!configured||!notices.length||!basketValid}/>}>
      <Dialog.Container visible={this.state.dialogVisible}><Dialog.Title>Reprint Receipt</Dialog.Title>
        <Dialog.Input label="Receipt No." value={this.state.reprintReceiptNo} onChangeText={value=>this.onReprintReceiptNoChange(value)}/>
        <Dialog.Button label="Cancel" onPress={this.handleCancel}/><Dialog.Button label="Print" onPress={this.handleReprint}/>
      </Dialog.Container>
    </PaymentFormLayout>;
  }
}
