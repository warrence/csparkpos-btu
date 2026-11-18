import LoadAdviceRules from './LoadAdviceRules';
import React, { Component } from 'react';
import { Alert, ScrollView, PixelRatio } from 'react-native';
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
  Spinner
} from 'native-base';
import { SERVER_URL } from '../../global';
import { showConnectionErrorAlert } from '../../helpers';
import LoadGeneralProfile from './LoadGeneralProfile';
import LoadCity from './LoadCity';
import LoadHoliday from './LoadHoliday';
import LoadPass from './LoadPass';
import LoadOpTable from './LoadOpTable';
import LoadOffence from './LoadOffence';
import LoadCoupon from './LoadCoupon';
import Footer from '../../Footer';
import { observer, inject } from 'mobx-react';
import { moderateScale } from "../../scaling";

const bugsnag = new Client();

const initialState = {
  Advice: {loading: false, loaded: false, error: false},
  pageLoading: false,
  isLoading: false,
  pondok_to_load: '',
  date_to_load: '',
  pondoks: [],
  GeneralProfile: {
    loading: false,
    loaded: false,
    error: false
  },
  City: {
    loading: false,
    loaded: false,
    error: false
  },
  Holiday: {
    loading: false,
    loaded: false,
    error: false
  },
  Pass: {
    loading: false,
    loaded: false,
    error: false
  },
  OpTable: {
    loading: false,
    loaded: false,
    error: false
  },
  Offence: {
    loading: false,
    loaded: false,
    error: false
  },
  Coupon: {
    loading: false,
    loaded: false,
    error: false
  },
};

@inject('generalStore') @observer
class LoadData extends Component {
  constructor(props) {
    super(props);
    this.state = initialState;
  }

  async componentWillMount() {

    this.setState({ pageLoading: true });
    await axios.get(`${SERVER_URL}/api/load-data/pondok`)
      .then(response => {
        this.setState({ pageLoading: false });
        this.setState({ pondoks: response.data });
      })
      .catch(error => {
        bugsnag.notify(error);
        showConnectionErrorAlert();
      });
    this.setState({ pondok_to_load: this.props.generalStore.PondokId });
    this.setState({ date_to_load: new Date() });
  }

  onDateToLoadChanged(text) {
    this.setState({ date_to_load: text });
  }

  onPondokToLoadChanged(text) {
    this.setState({ pondok_to_load: text });
  }

  async loadProcess(func, name) {
    this.setState({[name]: {loading: true, loaded: false, error: false}});
    let loaded = false;
    try { loaded = (await func) === true; } catch (error) { loaded = false; }
    this.setState({[name]: {loading: false, loaded, error: !loaded}});
    return loaded;
  }

  async onLoadButtonPress() {
    if (this._loading) return;
    this._loading = true;
    this.reset();
    this.setState({isLoading: true});
    try {
      if (!this.state.pondok_to_load) return Alert.alert('Please select your pondok');
      const failed = [];
      const tasks = [
        ['GeneralProfile', 'General Profile', () => LoadGeneralProfile(this)],
        ['City', 'City Councils', () => LoadCity()],
        ['Holiday', 'Holidays', () => LoadHoliday()],
        ['Pass', 'Passes', () => LoadPass()],
        ['OpTable', 'OP Rates', () => LoadOpTable()],
        ['Offence', 'Offences', () => LoadOffence()],
        ['Coupon', 'Coupons', () => LoadCoupon(this)],
        ['Advice', 'Advice Notice Rules', () => LoadAdviceRules()],
      ];
      for (const [key, label, load] of tasks) {
        if (!(await this.loadProcess(Promise.resolve().then(load), key))) failed.push(label);
      }
      const refreshed = await Promise.resolve().then(() => this.props.generalStore.reloadFromStorage())
        .then(() => true, () => false);
      if (!refreshed) failed.push('Local settings refresh');
      Alert.alert(failed.length ? `Load incomplete. Failed: ${failed.join(', ')}. Please try again.` : 'Load Process Completed');
    } finally {
      this._loading = false;
      this.setState({isLoading: false});
    }
  }

  reset() {
    let pondoks = this.state.pondoks;
    let pondok_to_load = this.state.pondok_to_load;
    let date_to_load = this.state.date_to_load;
    this.setState(initialState);
    this.setState({
      pondok_to_load: pondok_to_load,
      date_to_load: date_to_load,
      pondoks: pondoks });
  }
  renderPondok() {
    return this.state.pondoks.map(pondok =>
      <Picker.Item
        key={pondok.PondokID}
        label={`${pondok.PondokID} - ${pondok.PondokName}`}
        value={pondok.PondokID}
      />
    );
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
      <Button rounded iconLeft primary small onPress={this.onLoadButtonPress.bind(this)}>
        <Icon type="MaterialIcons" name="sync" />
        <Text>Load</Text>
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
            <Col style={{ flex:1, justifyContent: 'center', alignItems: 'center' }}>
              <Form style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                {
                  !this.state.pageLoading ?
                    <Picker
                      iosHeader="Select your Pondok"
                      iosIcon={<Icon type="MaterialIcons" name="expand-more" />}
                      placeholder="Select your Pondok"
                      placeholderStyle={{ color: 'black' }}
                      placeholderIconColor="#007aff"
                      mode="dropdown"
                      selectedValue={this.state.pondok_to_load}
                      style={styles.picker}
                      onValueChange={(text) => { this.onPondokToLoadChanged(text); }}
                    >
                      {this.renderPondok()}
                    </Picker> :
                    <Spinner color="black" size="small" />
                }


              <DatePicker
                style={styles.datePicker}
                date={this.state.date_to_load}
                mode="date"
                placeholder="Date To Load"
                format="YYYY-MM-DD"
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
              </Form>
            </Col>
          </Row>
          <Row style={{ flex: 3, backgroundColor: '#ffffff', justifyContent: 'center' }}>
            <Col style={{ alignItems: 'center' }}>

              <List style={{ flex: 1 }}>
                <ListItem style={styles.listItemStyle}>
                  <Body><Text style={styles.listTextStyle}>Advice Notice Rules</Text></Body>
                  {this.renderSpinner(this.state.Advice.loading)}
                  {this.renderLoadSuccess(this.state.Advice.loaded)}
                  {this.renderError(this.state.Advice.error)}
                </ListItem>
                <ListItem first style={styles.listItemStyle}>
                  <Body>
                    <Text style={styles.listTextStyle}>1. General Profile</Text>
                  </Body>
                  {this.renderSpinner(this.state.GeneralProfile.loading)}
                  {this.renderLoadSuccess(this.state.GeneralProfile.loaded)}
                  {this.renderError(this.state.GeneralProfile.error)}
                </ListItem>
                <ListItem style={styles.listItemStyle}>
                  <Body>
                    <Text style={styles.listTextStyle}>2. Profile - City</Text>
                  </Body>
                  {this.renderSpinner(this.state.City.loading)}
                  {this.renderLoadSuccess(this.state.City.loaded)}
                  {this.renderError(this.state.City.error)}
                </ListItem>
                <ListItem style={styles.listItemStyle}>
                  <Body>
                    <Text style={styles.listTextStyle}>3. Profile - Holidays</Text>
                  </Body>
                  {this.renderSpinner(this.state.Holiday.loading)}
                  {this.renderLoadSuccess(this.state.Holiday.loaded)}
                  {this.renderError(this.state.Holiday.error)}
                </ListItem>
                <ListItem style={styles.listItemStyle}>
                  <Body>
                    <Text style={styles.listTextStyle}>4. Profile - Staff</Text>
                  </Body>
                  {this.renderSpinner(this.state.Pass.loading)}
                  {this.renderLoadSuccess(this.state.Pass.loaded)}
                  {this.renderError(this.state.Pass.error)}
                </ListItem>
                <ListItem style={styles.listItemStyle}>
                  <Body>
                  <Text style={styles.listTextStyle}>5. Profile - Over Parking Fee</Text>
                  </Body>
                  {this.renderSpinner(this.state.OpTable.loading)}
                  {this.renderLoadSuccess(this.state.OpTable.loaded)}
                  {this.renderError(this.state.OpTable.error)}
                </ListItem>
                <ListItem style={styles.listItemStyle}>
                  <Body>
                  <Text style={styles.listTextStyle}>6. Profile - Offence Article</Text>
                  </Body>
                  {this.renderSpinner(this.state.Offence.loading)}
                  {this.renderLoadSuccess(this.state.Offence.loaded)}
                  {this.renderError(this.state.Offence.error)}
                </ListItem>
                <ListItem last style={styles.listItemStyle}>
                  <Body>
                  <Text style={styles.listTextStyle}>7.  Stock - Parking Coupons</Text>
                  </Body>
                  {this.renderSpinner(this.state.Coupon.loading)}
                  {this.renderLoadSuccess(this.state.Coupon.loaded)}
                  {this.renderError(this.state.Coupon.error)}
                </ListItem>
              </List>

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

export default LoadData;
