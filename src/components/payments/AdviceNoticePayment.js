import {assertNewAdviceNotices} from '../../advice/duplicates';
import React, {Component} from 'react';
import {Alert, ScrollView, StyleSheet, TouchableOpacity, View} from 'react-native';
import {Container, Grid, Row, Col, Card, CardItem, Text, Item, Input, Button, Picker, Icon, Left, Body, Right, DatePicker} from 'native-base';
import Dialog from 'react-native-dialog';
import {inject, observer} from 'mobx-react';
import moment from 'moment';
import realm from '../../realm';
import PrintReceipt from '../../printReceipt';
import {moderateScale} from '../../scaling';
import {readHolidayCalendar} from '../../payments/holidayCalendar';
import {readAdviceRules, adviceIsOverdue} from '../../advice/rules';
import {watchKuchingDay} from '../../payments/dayRollover';
import {adviceItem, adviceBasket, adviceTotals, money, cents, validateFixedAdvicePolicy} from '../../advice/collection';
import {saveAdviceReceipt} from '../../advice/storage';
import {noticeTaxCents} from '../../payments/noticeTax';
import {paymentSavedMessage, paymentChangeMessage} from '../../payments/tender';
import {PaymentFormLayout, PaymentDateField, PaymentFooter, PaymentInput, RemoveNoticeButton, paymentFormStyles as styles} from './shared/PaymentForm';

const emptyNotice = {noticeNo: '', noticeDate: ''};
const collectionConfiguration = database => {
  const configuration = readAdviceRules(database);
  validateFixedAdvicePolicy(configuration.rules);
  if (configuration.rules.collectionPolicyVersion !== 3)
    throw new Error('Download the office per-notice tax policy before new Advice collection.');
  return {...configuration, holidayCalendar: readHolidayCalendar(database)};
};

export class AdviceNoticePayment extends Component {
  constructor(props) {
    super(props);
    this.database = props.database || realm;
    this.cities = Array.from(this.database.objects('City'));
    const lastReceipt = Array.from(this.database.objects('AdviceReceiptHeader')).sort((a, b) => b.receiptDate - a.receiptDate)[0];
    let configuration = {};
    let message = '';
    try { configuration = collectionConfiguration(this.database); } catch (error) { message = error.message; }
    this._configuration = JSON.stringify(configuration);
    this.state = {...emptyNotice, city: this.cities[0] ? this.cities[0].code : '', carNo: '',
      items: [], overdue: false, amountReceived: '', reminderNo: '', lastReceiptNo: lastReceipt ? lastReceipt.receiptNo : '', saving: false,
      rules: configuration.rules, loadedAt: configuration.loadedAt, message};
  }

  componentDidMount() {
    if (this.database.addListener) this.database.addListener('change', this.refreshConfiguration);
    this._stopDayRefresh = watchKuchingDay(this.refreshDateStatus);
  }

  componentWillUnmount() {
    if (this.database.removeListener) this.database.removeListener('change', this.refreshConfiguration);
    if (this._stopDayRefresh) this._stopDayRefresh();
  }

  refreshConfiguration = () => {
    let configuration = {};
    let message = '';
    try { configuration = collectionConfiguration(this.database); } catch (error) { message = error.message; }
    const signature = JSON.stringify(configuration);
    const cities = Array.from(this.database.objects('City'));
    const citiesChanged = JSON.stringify(cities) !== JSON.stringify(this.cities);
    if (signature === this._configuration && !citiesChanged) return;
    this._configuration = signature;
    this.cities = cities;
    // A load-data refresh must not leave an open tab using obsolete policy.
    this.setState({...emptyNotice, items: [], overdue: false, amountReceived: '', reminderNo: '',
      city: cities[0] ? cities[0].code : '', rules: configuration.rules,
      loadedAt: configuration.loadedAt,
      message: message || 'Advice rules refreshed. Re-enter any selected notices.'});
  };

  change = (field, value) => {
    if (this._saving || this.state.saving) return;
    if (this.state.items.length && (field === 'city' || field === 'carNo' ||
        (field === 'noticeDate' && this.state.overdue))) return;
    this.setState({[field]: value}, field === 'noticeDate' ? this.refreshDateStatus : undefined);
  };

  removeNotice = noticeNo => {
    if (this._saving || this.state.saving) return;
    this.setState({items: this.state.items.filter(item => item.noticeNo !== noticeNo)}, this.refreshDateStatus);
  };
  computedOverdue = (date = this.state.noticeDate) => {
    if (!this.state.rules) throw new Error('Load Advice Notice rules at the office before collecting.');
    return adviceIsOverdue(date, this.state.rules, new Date(), readHolidayCalendar(this.database).dates);
  };

  refreshDateStatus = () => {
    if (this._saving || this.state.saving) return;
    let overdue = null, message = '';
    try { overdue = this.computedOverdue(); } catch (error) { message = error.message; }
    if (this.state.items.length) {
      if (overdue !== null && overdue !== this.state.overdue)
        message = 'Use one payment status per receipt. Clear the list before changing dates.';
      try {
        if (this.state.items.some(item => this.computedOverdue(item.noticeDate) !== this.state.overdue))
          message = 'Notice status changed. Clear the list and re-enter the notices.';
      } catch (error) { message = error.message; }
      this.setState({message});
    } else this.setState({overdue: overdue === true, message});
  };

  addNotice = () => {
    if (this._saving || this.state.saving) return;
    try {
      if (!this.state.rules) throw new Error('Load Advice Notice rules at the office before collecting.');
      const overdue = this.computedOverdue();
      if (this.state.items.length && overdue !== this.state.overdue)
        throw new Error('Use one payment status per receipt. Clear the list before changing dates.');
      if (overdue && this.state.items.some(item => moment(item.noticeDate).format('YYYY-MM-DD') !== this.state.noticeDate))
        throw new Error('Use one notice date per overdue receipt. Clear the list to change it.');
      const item = adviceItem(this.state, this.state.rules, overdue);
      const items = [...this.state.items, item];
      adviceBasket(items, overdue, this.state.rules.feeBasis, this.state.rules.collectionPolicyVersion);
      if (items.length > 100) throw new Error('Use at most 100 notices per receipt.');
      this.setState({...emptyNotice, noticeDate: this.state.noticeDate, items, overdue, message: ''});
    } catch (error) { this.setState({message: error.message}); }
  };

  pay = async () => {
    if (this._saving || this._duplicatePromptOpen || this._duplicateReprinting) return;
    this._saving = true;
    this.setState({saving: true, message: ''});
    let saved;
    try {
      assertNewAdviceNotices(this.database, this.state.items);
      if (!this.state.rules) throw new Error('Load Advice Notice rules at the office before collecting.');
      saved = saveAdviceReceipt(this.database, {items: this.state.items, overdue: this.state.overdue,
        userName: this.props.authStore && this.props.authStore.userName, reminderNo: this.state.reminderNo, amountReceived: this.state.amountReceived, rules: this.state.rules});
      this.setState({...emptyNotice, items: [], overdue: false, amountReceived: '', reminderNo: '', lastReceiptNo: saved.receiptNo, dateRevision: (this.state.dateRevision || 0) + 1});
      await this.print(saved.receiptNo);
      const message = paymentSavedMessage(saved.receiptNo, saved.change);
      this.setState({message: `${message} Send this receipt to the office with Daily Posting.`});
      Alert.alert(message);
    } catch (error) {
      const message = saved ? `Receipt ${saved.receiptNo} is saved. Printing failed; use Reprint. Do not collect it again.${saved.change == null ? '' : ` ${paymentChangeMessage(saved.change)}.`}` : error.message;
      this.setState({message});
      if (!saved && error.printKind === 'an' && error.receiptNo && typeof error.validateReprint === 'function') {
        const receiptNo = error.receiptNo;
        this._duplicateReprintGuards = {...this._duplicateReprintGuards, [receiptNo]:error.validateReprint};
        this._duplicatePromptOpen = true;
        Alert.alert(message, 'Reprint the verified saved Advice receipt without collecting again?', [
          {text:'Cancel', style:'cancel', onPress:()=>{this._duplicatePromptOpen=false;}},
          {text:'Reprint', onPress:async()=>{
            this._duplicatePromptOpen = false;
            if (this._duplicateReprinting) return;
            this._duplicateReprinting = true;
            try {
              error.validateReprint();
              await this.print(receiptNo);
            } catch (failure) {
              const message = `Unable to reprint receipt ${receiptNo}: ${failure.message}`;
              this.setState({message}); Alert.alert(message);
            } finally { this._duplicateReprinting = false; }
          }}
        ], {cancelable:true, onDismiss:()=>{this._duplicatePromptOpen=false;}});
      } else Alert.alert(saved ? message : `Payment was not saved: ${message}`);
    } finally { this._saving = false; this.setState({saving: false}); }
  };

  print = receiptNo => {
    const printer = this.props.printer || new PrintReceipt();
    return printer.print('an', receiptNo);
  };

  clearForm = () => {
    if (this._saving) return;
    this.setState({...emptyNotice, items: [], overdue: false, amountReceived: '', reminderNo: '', carNo: '', message: '', dateRevision: (this.state.dateRevision || 0) + 1});
  };

  reprint = async () => {
    if (this._duplicateReprinting) return;
    this._duplicateReprinting = true;
    this.setState({reprintDialogVisible: false});
    try {
      const receiptNo = this.state.lastReceiptNo.trim();
      if (this._duplicateReprintGuards && this._duplicateReprintGuards[receiptNo]) this._duplicateReprintGuards[receiptNo]();
      await this.print(receiptNo);
    }
    catch (error) { this.setState({message: `Unable to print: ${error.message}`}); }
    finally { this._duplicateReprinting = false; }
  };

  field(label, field, numeric = false, editable = true) {
    return <Item regular style={styles.field} key={field}>
      <Input testID={`advice-${field}`} value={this.state[field]} editable={editable && !this.state.saving}
        style={styles.input} placeholder={label} keyboardType={numeric ? 'decimal-pad' : 'default'} autoCapitalize="characters"
        onChangeText={value => this.change(field, value)} />
    </Item>;
  }

  render() {
    const {rules, items, saving} = this.state;
    const enabled = !!rules && this.cities.length > 0 && !saving;
    let draftStatus = null, basketValid = true;
    try { draftStatus = this.computedOverdue(); } catch (error) {}
    try { basketValid = items.every(item => this.computedOverdue(item.noticeDate) === this.state.overdue); } catch (error) { basketValid = false; }
    const canAdd = draftStatus !== null && (!items.length || draftStatus === this.state.overdue);
    const allocated = adviceBasket(items, this.state.overdue, rules && rules.feeBasis, rules && rules.collectionPolicyVersion);
    const totals = adviceTotals(allocated);
    const dateLocked = this.state.overdue && items.length > 0;
    const surcharge = this.state.overdue && rules ? cents(rules.overdueFee) : 0;
    const unitAmount = rules ? money(cents(rules.baseAmount)+cents(rules.excessCharges)+
      (rules.taxEnabled ? noticeTaxCents(cents(rules.baseAmount),rules.taxPercent) : 0)) : null;
    // Presentation only: saved items keep the established fee allocation.
    if (!items.length) { totals.overdue = surcharge; totals.total += surcharge; }
    const list = <React.Fragment>
      <Row style={styles.tableRow}><Text style={styles.index}>#</Text><Text style={styles.number}>AN No.</Text><Text style={styles.date}>AN Date</Text><Text style={styles.amount}>Amount</Text><Text style={styles.remove}> </Text></Row>
      {this.state.overdue && <Row testID="advice-overdue-charge-row" style={styles.tableRow}>
        <Text style={styles.index}>1.</Text><Text style={styles.number}>Overdue Charges</Text><Text style={styles.date}> </Text>
        <Text testID="advice-overdue-charge-amount" style={styles.amount}>{money(surcharge)}</Text><Text style={styles.remove}> </Text>
      </Row>}
      {allocated.map((item,index)=><Col key={item.noticeNo} style={styles.item}>
        <Row style={styles.tableRow}><Text style={styles.index}>{index+(this.state.overdue?2:1)}.</Text>
          <Text style={styles.number}>{item.noticeNo}</Text><Text style={styles.date}>{moment(item.noticeDate).format('DD/MM/YYYY')}</Text>
          <Text testID={`advice-notice-price-${item.noticeNo}`} style={styles.amount}>{(item.baseAmount+item.excessCharge+item.taxAmount).toFixed(2)}</Text>
          <RemoveNoticeButton prefix="advice" noticeNo={item.noticeNo} disabled={saving} onPress={()=>this.removeNotice(item.noticeNo)}/>
        </Row>
      </Col>)}
      <Text style={styles.message} accessibilityLiveRegion="polite">{this.state.message}</Text>
    </React.Fragment>;
    const entry=<React.Fragment>
      <Text testID="advice-status" style={styles.small}>{draftStatus === null ? 'Select a valid notice date.' : draftStatus ? 'Overdue' : 'Normal'}</Text>
      <Picker testID="advice-city" style={{height:40}} enabled={enabled&&!items.length} selectedValue={this.state.city} onValueChange={value=>this.change('city',value)}>{this.cities.map(city=><Picker.Item key={city.code} label={city.code} value={city.code}/>)}</Picker>
      {this.field('Car No.','carNo',false,enabled&&!items.length)}
      <PaymentInput prefix="advice" field="reminderNo" maxLength={20} label="Reminder No. (optional)" value={this.state.reminderNo} editable={enabled&&rules.reminderNoSupported===true} onChange={value=>this.change('reminderNo',value)}/>
      {rules&&rules.reminderNoSupported!==true&&<Text style={styles.detail}>Download updated office settings to enable reminder numbers.</Text>}
      {this.field('AN No.','noticeNo',false,enabled)}
      <PaymentDateField prefix="advice" label="AN date" value={this.state.noticeDate} disabled={!enabled||dateLocked} revision={this.state.dateRevision}
        onPickerRef={picker=>{this.datePicker=picker;}} onChange={date=>this.change('noticeDate',moment(date).format('YYYY-MM-DD'))}/>
      {rules&&<Text testID="advice-configured-rate" style={styles.small}>Amount RM {unitAmount}</Text>}
      <Row style={{marginTop:8}}><Col style={{paddingRight:5}}><Button iconLeft full block primary disabled={!enabled||!canAdd} testID="advice-add" onPress={this.addNotice}><Icon name="md-add"/><Text>Add</Text></Button></Col>
        <Col style={{paddingLeft:5}}><Button iconLeft full block warning disabled={saving} testID="advice-clear" onPress={this.clearForm}><Icon type="MaterialIcons" name="clear"/><Text>Clear</Text></Button></Col></Row>
      <Button iconLeft full block primary style={{marginTop:8}} disabled={saving} testID="advice-reprint" onPress={()=>this.setState({reprintDialogVisible:true})}><Icon name="md-print"/><Text>Reprint Receipt</Text></Button>
    </React.Fragment>;
    return <PaymentFormLayout prefix="advice" title={`Advice Notice ${this.state.overdue?'(Overdue)':''}`} items={list} entry={entry}
      footer={<PaymentFooter prefix="advice" total={totals.total/100} received={this.state.amountReceived} onReceived={value=>this.change('amountReceived',value)} pay={this.pay} saving={saving} disabled={!enabled||!items.length||!basketValid}/>}>
      <Dialog.Container visible={!!this.state.reprintDialogVisible}><Dialog.Title>Reprint Receipt</Dialog.Title>
        <Dialog.Input label="Receipt No." value={this.state.lastReceiptNo} onChangeText={value=>this.change('lastReceiptNo',value)}/>
        <Dialog.Button label="Cancel" onPress={()=>this.setState({reprintDialogVisible:false})}/><Dialog.Button label="Print" disabled={!this.state.lastReceiptNo.trim()} onPress={this.reprint}/>
      </Dialog.Container>
    </PaymentFormLayout>;
  }
}

export default inject('authStore')(observer(AdviceNoticePayment));
