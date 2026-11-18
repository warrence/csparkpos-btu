import React from 'react';
import {StyleSheet, TouchableOpacity, View, ScrollView} from 'react-native';
import {Container, Grid, Row, Col, Card, CardItem, Text, Item, Input, Button, Icon, Left, Body, Right, DatePicker} from 'native-base';
import moment from 'moment';
import {moderateScale} from '../../../scaling';

export const paymentFormStyles = StyleSheet.create({
  container: {flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center'},
  receipts: {flex: 4, padding: moderateScale(3)}, entry: {flex: 2, padding: moderateScale(3)},
  header: {height: moderateScale(6)}, small: {fontSize: moderateScale(6)},
  field: {height: 35, marginVertical: 4}, input: {fontSize: moderateScale(6)},
  dateField: {minHeight: 45, marginVertical: 4, paddingHorizontal: 10, borderWidth: 1, borderColor: '#ccc', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  placeholder: {color: '#777'}, calendarIcon: {fontSize: moderateScale(8), color: '#555'},
  tableRow: {alignItems: 'center', minHeight: 35}, index: {flex: 0.5, fontSize: moderateScale(6)},
  number: {flex: 3, fontSize: moderateScale(6)}, date: {flex: 2, fontSize: moderateScale(6)},
  amount: {flex: 1.5, textAlign: 'right', fontSize: moderateScale(6)}, remove: {width: 48},
  removeButton: {width: 48, minHeight: 44, alignItems: 'center', justifyContent: 'center', padding: 0},
  trash: {fontSize: moderateScale(8)}, item: {borderBottomWidth: 1, borderColor: '#eee', paddingBottom: 4},
  detail: {fontSize: moderateScale(5), color: '#555'}, message: {marginVertical: 8, color: '#8c2500', fontSize: moderateScale(6)},
  footer: {height: moderateScale(40)}, total: {fontSize: moderateScale(30), fontWeight: 'bold', color: 'darkred'},
});

export function RemoveNoticeButton({prefix,noticeNo,disabled,onPress}) {
  return <TouchableOpacity testID={`${prefix}-remove-${noticeNo}`} accessible accessibilityRole="button"
    accessibilityLabel={`Remove notice ${noticeNo}`} accessibilityHint="Removes this notice from the current basket"
    disabled={disabled} onPress={onPress} style={paymentFormStyles.removeButton}>
    <Icon type="MaterialIcons" name="delete" accessible={false}
      style={{fontSize:24,color:disabled?'#999':'#b3261e',marginLeft:0,marginRight:0}}/>
  </TouchableOpacity>;
}

export function PaymentFormLayout({prefix, title, items, entry, footer, children}) {
  const s=paymentFormStyles;
  return <Container testID={`${prefix}-layout`} style={s.container}>
    <Grid><Row>
      <Col style={s.receipts}><Card style={{flex:1}}>
        <CardItem header bordered style={s.header}><Text style={s.small}>Purchase Item List — {title}</Text></CardItem>
        <CardItem style={{flex:1,alignItems:'flex-start'}}><ScrollView style={{flex:1}}>{items}</ScrollView></CardItem>
        <CardItem bordered footer style={s.footer}>{footer}</CardItem>
      </Card></Col>
      <Col style={s.entry}><Card style={{flex:1}}><CardItem style={{flex:1,alignItems:'flex-start'}}><ScrollView style={{flex:1}}>{entry}</ScrollView></CardItem></Card></Col>
    </Row></Grid>{children}
  </Container>;
}

export function PaymentDateField({prefix,label,value,disabled,onChange,revision=0,minimumDate,onPickerRef}) {
  let picker;
  const s=paymentFormStyles;
  return <View>
    <TouchableOpacity testID={`${prefix}-date-field`} accessibilityRole="button" accessibilityLabel={label}
      accessibilityHint="Opens the date picker" disabled={disabled} style={s.dateField}
      onPress={()=>{if(!disabled && picker)picker.showDatePicker();}}>
      <Text testID={`${prefix}-date-value`} style={[s.small,!value&&s.placeholder]}>{value?moment(value).format('DD/MM/YYYY'):`Select ${label}`}</Text>
      <Icon type="MaterialIcons" name="date-range" style={s.calendarIcon}/>
    </TouchableOpacity>
    <View style={{display:'none'}}><DatePicker key={revision} ref={ref=>{picker=ref;if(onPickerRef)onPickerRef(ref);}}
      defaultDate={value?moment(value).toDate():undefined} minimumDate={minimumDate} maximumDate={new Date()}
      disabled={disabled} locale="en" androidMode="default" onDateChange={date=>{if(!disabled)onChange(date);}}/></View>
  </View>;
}

export function PaymentInput({prefix,field,label,value,onChange,editable=true,numeric=false,maxLength}) {
  const s=paymentFormStyles;
  return <Item regular style={s.field}><Input testID={`${prefix}-${field}`} value={value==null?'':String(value)}
    editable={editable} maxLength={maxLength} style={s.input} placeholder={label} accessibilityLabel={label}
    keyboardType={numeric?'decimal-pad':'default'} autoCapitalize="characters" onChangeText={onChange}/></Item>;
}

export function PaymentFooter({prefix,total,received,onReceived,pay,saving,disabled}) {
  const s=paymentFormStyles;
  return <React.Fragment>
    <Left style={{flex:1}}><Button testID={`${prefix}-pay`} iconLeft small rounded full success disabled={disabled||saving} onPress={pay}><Icon type="FontAwesome" name="money"/><Text>{saving?'Saving…':'Pay'}</Text></Button></Left>
    <Body><Item regular style={{width:150,marginLeft:10}}><Input testID={`${prefix}-amountReceived`} accessibilityLabel="Received amount (optional)"
      value={received==null?'':String(received)} editable={!saving} style={{fontSize:moderateScale(8)}} placeholder="Received" keyboardType="decimal-pad" onChangeText={onReceived}/></Item></Body>
    <Right style={{flex:2}}><Text style={s.total}>{Number(total).toFixed(2)}</Text></Right>
  </React.Fragment>;
}
