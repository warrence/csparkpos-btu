import React, { Component } from 'react';
import { Alert, PixelRatio } from 'react-native';
import DatePicker from 'react-native-datepicker';
import axios from 'axios';
import { Client } from 'bugsnag-react-native';
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
import { moderateScale } from "../scaling";
import realm from '../realm';
import moment from 'moment';
import printClosing from '../printClosing';
import PrintReceipt from "../printReceipt";

const bugsnag = new Client();

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

  onPondokToLoadChanged(text) {
    this.setState({ pondok_to_load: text });
  }

  async loadProcess(func, name) {
    await this.setState({ [name]: { ...this.state[name], loading: true } });
    if (await func) {
      await this.setState({ [name]: { ...this.state[name], loaded: true } });
    } else {
      await this.setState({ [name]: { ...this.state[name], error: true } });
    }
    await this.setState({ [name]: { ...this.state[name], loading: false } });
  }

  async onLoadButtonPress() {
    if (this._closing) return;
    const date = moment(this.state.date_to_load, 'DD/MM/YYYY', true);
    if (!date.isValid()) { Alert.alert('Choose a valid closing date.'); return; }
    this._closing = true;
    this.setState({ isLoading: true });
    let timeout;
    try {
      const deadline = new Promise((resolve, reject) => {
        timeout = setTimeout(() => reject(new Error('Printer response timed out. Output may already have printed; check before retrying.')), 15000);
      });
      const accepted = await Promise.race([
        Promise.resolve().then(() => this.state.printClosing.print(date.format('YYYY-MM-DD'), this.props.authStore.userName)),
        deadline
      ]);
      if (accepted !== true) throw new Error('Printer did not confirm the closing print. Check output before retrying.');
      Alert.alert('Daily Closing Completed');
    } catch (error) {
      Alert.alert('Daily Closing print failed', `${error.message || 'Printer error.'}\nSaved receipts are unchanged. Check printed output before retrying.`);
    } finally {
      clearTimeout(timeout);
      this._closing = false;
      this.setState({ isLoading: false });
    }
  }

  reset() {
    let date_to_load = this.state.date_to_load;
    this.setState(initialState);
    this.setState({
      date_to_load: date_to_load
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
      <Button rounded primary small onPress={this.onLoadButtonPress.bind(this)} style={{marginTop: 20}}>
        <Text>Close Now</Text>
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
                    placeholder="Choose a closing date"
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
    height:40,
    marginRight:16,
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
