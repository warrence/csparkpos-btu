import {postLegacyBatch} from '../payments/safePosting';
import {postAdviceBatch} from '../advice/payload';
import React, { Component } from 'react';
import { Alert, PixelRatio } from 'react-native';
import DatePicker from 'react-native-datepicker';
import axios from 'axios';
import {
  Text,
  Container,
  Content,
  Grid,
  Row,
  Col,
  Picker,
  Form,
  Button,
  Icon,
  Body,
  ListItem,
  List,
  Spinner,
  Item
} from 'native-base';
import { SERVER_URL } from '../global';
import { showConnectionErrorAlert } from '../helpers';
import { observer, inject } from 'mobx-react';
import { moderateScale } from '../scaling';
import realm from '../realm';
import moment from 'moment';
import printClosing from '../printClosing';
import PrintReceipt from '../printReceipt';


const initialState = {
  pageLoading: false,
  isLoading: false,
  pondok_to_load: '',
  date_to_load: '',
  pondoks: [],
  Pa: {
    loading: false,
    loaded: false,
    error: false
  },
  Pb: {
    loading: false,
    loaded: false,
    error: false
  },
  Coupon: {
    loading: false,
    loaded: false,
    error: false
  },
  printClosing: new printClosing(),
};

@inject('generalStore', 'authStore') @observer
class Closing extends Component {
  constructor(props) {
    super(props);
    this.state = initialState;
  }

  async componentWillMount() {
    this.setState({ pageLoading: true });

    this.setState({ date_to_load: moment(new Date()).format('DD/MM/YYYY') });
  }

  onDateToLoadChanged(text) {
    this.setState({ date_to_load: text });
  }

  async onLoadButtonPress() {
    if (this._posting) return;
    const selectedDate = moment(this.state.date_to_load, 'DD/MM/YYYY', true);
    if (!selectedDate.isValid()) return Alert.alert('Choose a valid posting date.');
    this._posting = true;
    try {
      this.reset();
      this.setState({ isLoading: true });

      const postingDateStart = selectedDate.clone().startOf('day');
      const postingDateEnd = postingDateStart.clone().add(1, 'days');

      const adviceResult = await postAdviceBatch(realm, axios, SERVER_URL, postingDateStart.toDate(), postingDateEnd.toDate(), true);
      const legacyResult=await postLegacyBatch(realm,axios,SERVER_URL,postingDateStart.toDate(),postingDateEnd.toDate(),selectedDate.format('DD/MM/YYYY'))
        .catch(error=>({sent:0,pending:true,message:error.message}));
      const counts=legacyResult.counts||{op:0,pa:0,couponReceipts:0,alreadyReceived:0,receipts:0};
      const noticeTotal=counts.op+(adviceResult.notices||0)+counts.pa;
      const priorCount=counts.alreadyReceived+(adviceResult.alreadyReceivedNotices||0);
      const countMessage=`Notices confirmed: ${noticeTotal} (OP ${counts.op}, AN ${adviceResult.notices||0}, PA ${counts.pa}).\nPreviously received on an earlier attempt: ${priorCount}; newly received: ${noticeTotal-priorCount}.\nReceipts confirmed: ${counts.receipts+(adviceResult.confirmedReceipts||0)}. Coupon receipts: ${counts.couponReceipts} (not notices).`;
      const legacyMessage=legacyResult.pending?legacyResult.message:legacyResult.sent?'Office upload confirmed, not payment settlement.':'No other receipts selected.';
      const reviewMessage = adviceResult.blockedLegacy ? `\n${adviceResult.blockedLegacy} Advice receipts use the old calculation. Kept unchanged for owner review; do not recollect or delete them.` : '';
      Alert.alert('Daily Posting', `${countMessage}\n${legacyMessage}\nAdvice receipts kept locally: ${adviceResult.retained}.${reviewMessage}`);
    } catch (error) {
      Alert.alert('Daily Posting', `Posting stopped: ${error.message}. Receipts are retained. Review their upload status before retrying.`);
    } finally {
      this._posting = false;
      this.setState({ isLoading: false });
    }
  }

  reset() {
    const date_to_load = this.state.date_to_load;
    this.setState(initialState);
    this.setState({
      date_to_load
    });
  }

  renderSpinner(isLoading) {
    if (isLoading) {
      return (
        <Spinner color="black" size="small" />
      );
    }
  }

  renderError(isError) {
    if (isError) {
      return (
        <Icon type="Ionicons" name="ios-warning-outline" style={{ color: '#9C0002' }} />
      );
    }

    return null;
  }

  renderLoadSuccess(isLoadSuccess) {
    if (isLoadSuccess) {
      return (
        <Icon type="Ionicons" name="ios-checkmark-circle-outline" style={{ color: '#00cc1f' }} />
      );
    }

    return null;
  }

  renderLoadButton() {
    if (this.state.isLoading) {
      return (
        <Spinner color="black" size="small" />
      );
    }

    return (
      <Button rounded primary small onPress={this.onLoadButtonPress.bind(this)} style={{ marginTop: 20 }}>
        <Text>Post Now</Text>
      </Button>
    );
  }

  formatDateToLoad() {
    return '999999';
  }

  render() {
    return (
      <Container style={styles.containerStyle}>
        <Grid>
          <Row style={{ flex: 1, backgroundColor: '#00bbdb' }}>
            <Col style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>

              <Form style={{}}>
                <Item last>
                  <DatePicker
                    style={styles.datePicker}
                    date={this.state.date_to_load}
                    mode="date"
                    placeholder="Choose a posting date"
                    format="DD/MM/YYYY"
                    confirmBtnText="Confirm"
                    cancelBtnText="Cancel"
                    customStyles={{
                      dateIcon: {
                        position: 'absolute',
                        left: 0,
                        top: 4,
                        marginLeft: 0,
                      },
                      dateInput: {
                        marginLeft: 36,
                        backgroundColor: '#ffffff'
                      }
                      // ... You can check the source to find the other keys.
                    }}
                    onDateChange={(date) => { this.onDateToLoadChanged(date); }}
                  />
                  {this.renderLoadButton()}
                </Item>

              </Form>

            </Col>
          </Row>
        </Grid>
      </Container>
    );
  }
}

const styles = {
  containerStyle: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  listTextStyle: {
    fontSize: moderateScale(8)
  },
  listItemStyle: {
    width: moderateScale(300),
    height: moderateScale(23)
  },
  picker: {
    color: '#616161',
    borderRadius: 14,
    borderWidth: 1,
    backgroundColor: '#e2e2e2',
    borderBottomWidth: 1 / PixelRatio.get(),
    borderTopWidth: 1 / PixelRatio.get(),
    borderColor: '#484848',
    width: 110,
    height: 40,
    marginRight: 16,
    transform: [
      { scaleX: 0.8 },
      { scaleY: 0.8 },
    ]
  },
  datePicker: {
    transform: [
      { scaleX: 0.8 },
      { scaleY: 0.8 },
    ]
  }
};

export default Closing;
