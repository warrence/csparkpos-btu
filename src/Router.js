import React, { Component } from 'react';
import { Stack, Scene, Router, Actions, Tabs } from 'react-native-router-flux';
import { Platform, View, PixelRatio } from 'react-native';
import { Icon, Text } from 'native-base';
import LoginForm from './components/LoginForm';
import Dashboard from './components/Dashboard';
import LoadData from './components/load-data/LoadData';
import Maintenance from './components/Maintenance';
import GeneralProfileMaintenance from './components/maintenances/GeneralProfileMaintenance'
import CityCouncilMaintenance from './components/maintenances/CityCouncilsMaintenance'
import HolidayMaintenance from './components/maintenances/HolidaysMaintenance'
import OffenceMaintenance from './components/maintenances/OffenceMaintenance'
import CouponMaintenance from './components/maintenances/CouponMaintenance'
import OpTableMaintenance from './components/maintenances/OpTableMaintenance'
import ReceiptMaintenance from './components/maintenances/ReceiptMaintenance'
import CompoundPayment from './components/payments/CompoundPayment';
import OpnPayment from './components/payments/OpnPayment';
import AdviceNoticePayment from './components/payments/AdviceNoticePayment';
import CouponPayment from './components/payments/CouponPayment';
import Settings from './components/Settings';
import Closing from './components/closing';
import Posting from './components/posting';
import OpReceiptViewMaintenance from './components/maintenances/OpReceiptViewMaintenance'
import PaReceiptViewMaintenance from './components/maintenances/PaReceiptViewMaintenance'
import CouponReceiptViewMaintenance from './components/maintenances/CouponReceiptViewMaintenance'
import realm from './realm';
import { observer, inject } from 'mobx-react';
import {moderateScale} from "./scaling";
import AuthStore from "./stores/AuthStore";
import MBillPayment from './components/payments/MBillPayment';
import MBillReceiptViewMaintenance from './components/maintenances/MBillReceiptViewMaintenance';

class TabIcon extends Component {
  render() {
    var color = this.props.selected ? '#00f240' : '#301c2a';

    return (
      <View style={{flex:1, flexDirection:'column', alignItems:'center', alignSelf:'center', justifyContent: 'center'}}>
        <Icon style={{color: color}} type="Entypo" name={this.props.iconName || "circle"} size={18}/>
        <Text style={{color: color, fontSize: 12}}>aaa</Text>
      </View>
    );
  }
}


const RouterComponent = inject("authStore")(observer((props) => {

  this.state = {
    userName: '',
    fullName: ''
  }


  async function checkAuth() {

    const session = await AuthStore.restoreSession();
    if (session.removed) {
      Actions.login();
    } else if (realm.objects('Pass').length <= 0) {
      Actions.loadData();
    } else if (!session.authenticated) {
      Actions.login();
    }
  }



  return (
    <Router>
      <Stack key="root" hideNavBar>
        <Scene key="main">
          <Scene key="dashboard" component={Dashboard} title="Dashboard" onEnter={() => checkAuth()} />
          <Scene key="loadData" component={LoadData} title="Load Data" />
          <Scene key="maintenance" component={Maintenance} title="Maintenance" onEnter={() => checkAuth()} />
          <Scene key="settings" component={Settings} title="Settings" onEnter={() => checkAuth()} />
          <Scene key="closing" component={Closing} title="Daily Closing" onEnter={() => checkAuth()} />
          <Scene key="posting" component={Posting} title="Daily Posting" onEnter={() => checkAuth()} />
          <Scene key="generalProfileMaintenance" component={GeneralProfileMaintenance} title="General Profile Data" onEnter={() => checkAuth()} />
          <Scene key="cityCouncilMaintenance" component={CityCouncilMaintenance} title="City Council Data " onEnter={() => checkAuth()} />
          <Scene key="holidayMaintenance" component={HolidayMaintenance} title="Holiday Data " onEnter={() => checkAuth()} />
          <Scene key="offenceMaintenance" component={OffenceMaintenance} title="Offence Article Data " onEnter={() => checkAuth()} />
          <Scene key="couponMaintenance" component={CouponMaintenance} title="Coupon Data " onEnter={() => checkAuth()} />
          <Scene key="opTableMaintenance" component={OpTableMaintenance} title="PB Rate Data " onEnter={() => checkAuth()} />
          <Scene key="receiptMaintenance" component={ReceiptMaintenance} title="Receipts Maintenance " onEnter={() => checkAuth()} />
          <Scene key="opReceiptViewMaintenance" component={OpReceiptViewMaintenance} title="View OP Receipts " onEnter={() => checkAuth()} />
          <Scene key="paReceiptViewMaintenance" component={PaReceiptViewMaintenance} title="View PA Receipts " onEnter={() => checkAuth()} />
          <Scene key="mBillReceiptViewMaintenance" component={MBillReceiptViewMaintenance} title="View MBill Receipts " onEnter={() => checkAuth()} />
          <Scene key="couponReceiptViewMaintenance" component={CouponReceiptViewMaintenance} title="View Coupon Receipts " onEnter={() => checkAuth()} />
          <Tabs key="payment" tabs={true} tabBarStyle={styles.tabBar} activeBackgroundColor="#00BBDB" tabBarPosition={{ top: 0 }}  hideNavBar={ Platform.OS === 'ios' ? false : true} onEnter={() => checkAuth()} wrap={false}>
            <Scene key="compoundPayment" component={CompoundPayment} title="Compound Payment" />
            <Scene key="opnPayment" component={OpnPayment} title="OPN Payment" />
            <Scene key="adviceNoticePayment" component={AdviceNoticePayment} title="Advice Notice" />
            {/* Hidden for now; keep the payment components available for future use.
            <Scene key="couponPayment" component={CouponPayment} title="Coupon Payment" />
            <Scene key="mbillPayment" component={MBillPayment} title="MBill Payment" />
            */}
          </Tabs>
        </Scene>

        <Scene key="auth" hideNavBar>
          <Scene key="login" component={LoginForm} title="Please Login" />
        </Scene>
      </Stack>
    </Router>
  );
}));

const styles = {
  container: {
    flex: 1,
  },
  tabBar: {
    borderBottomColor: 'darkgrey',
    borderBottomWidth: 1 / PixelRatio.get(),
    backgroundColor: 'ghostwhite',
    opacity: 0.98,
    height: moderateScale(20)
  },
  navigationBarStyle: {
    backgroundColor: 'red',
  },
  navigationBarTitleStyle: {
    color:'white',
  },
};

export default RouterComponent;
