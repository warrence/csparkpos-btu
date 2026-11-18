import React, { Component } from 'react';
import { Container, Card, CardItem, Grid, Row, Col, Icon, Text, Body, Button } from 'native-base';
import { Actions } from 'react-native-router-flux';

import { inject, observer } from 'mobx-react';
import { scale, moderateScale } from '../scaling';
import { resetDatabase } from '../helpers';
import { version } from '../global';

@inject('generalStore', 'authStore') @observer
class Dashboard extends Component {

  componentWillMount() {

  }

  logout() {
    this.props.authStore.logout();
    //resetDatabase();

    Actions.login();
  }

  render() {
    const { containerStyle, cardStyle, cardBodyStyle, cardTitleTextStyle, cardLogoStyle } = styles;

    return (
      <Container style={containerStyle}>
          <Grid>
            <Row>
              <Col style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'white' }}>
                <Text style={{ fontSize: moderateScale(15), color: 'grey' }}>({this.props.generalStore.PondokId}) {this.props.generalStore.PondokName}</Text>
                <Text style={{ fontSize: moderateScale(15), fontWeight: 'bold' }}>{this.props.authStore.fullName}</Text>
                  <Button success small iconLeft onPress={() => this.logout()} style={{ alignSelf: 'center' }}>
                    <Icon type="Ionicons" name="ios-log-out" />
                    <Text>Logout</Text>
                  </Button>
                <Text>Ver. {version}</Text>
              </Col>
            </Row>
            <Row>
              <Col>
                <Card style={cardStyle}>
                  <CardItem button style={{ flex: 1, backgroundColor: '#f9ff00' }} onPress={() => Actions.closing()}>
                    <Body style={cardBodyStyle}>
                    <Icon type="MaterialIcons" name="power-settings-new" style={cardLogoStyle} />
                    <Text style={cardTitleTextStyle}>Daily Closing</Text>
                    </Body>
                  </CardItem>
                </Card>
              </Col>
              <Col>
                <CardItem button style={{ flex: 1, backgroundColor: '#a6ff00' }} onPress={() => Actions.payment()}>
                  <Body style={cardBodyStyle}>
                  <Icon type="MaterialIcons" name="receipt" style={cardLogoStyle} />
                  <Text style={cardTitleTextStyle}>
                    Payment Collection
                  </Text>
                  </Body>
                </CardItem>
              </Col>
              <Col>
                <Card style={cardStyle}>
                  <CardItem button style={{ flex: 1, backgroundColor: '#f500ff' }} onPress={() => Actions.posting()}>
                    <Body style={cardBodyStyle}>
                    <Icon type="MaterialIcons" name="unarchive" style={cardLogoStyle} />
                    <Text style={cardTitleTextStyle}>Daily Posting</Text>
                    </Body>
                  </CardItem>
                </Card>
              </Col>
            </Row>
            <Row>
              <Col>
                <Card style={cardStyle}>
                  <CardItem button style={{ flex: 1, backgroundColor: '#ff9e00' }} onPress={() => Actions.settings()}>
                    <Body style={cardBodyStyle}>
                    <Icon type="MaterialIcons" name="settings" style={cardLogoStyle} />
                    <Text style={cardTitleTextStyle}>Settings</Text>
                    </Body>
                  </CardItem>
                </Card>
              </Col>
              <Col>
                <CardItem button style={{ flex: 1, backgroundColor: '#00feff' }} onPress={() => Actions.loadData()}>
                  <Body style={cardBodyStyle}>
                  <Icon type="MaterialIcons" name="sync" style={cardLogoStyle} />
                  <Text style={cardTitleTextStyle}>Load Data</Text>
                  </Body>
                </CardItem>
              </Col>
              <Col>
                <Card style={cardStyle}>
                  <CardItem button style={{ flex: 1, backgroundColor: '#f2000f' }} onPress={() => Actions.maintenance()}>
                    <Body style={cardBodyStyle}>
                    <Icon type="MaterialIcons" name="perm-data-setting" style={cardLogoStyle} />
                    <Text style={cardTitleTextStyle}>Maintenance</Text>
                    </Body>
                  </CardItem>
                </Card>
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
    justifyContent: 'center'
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
  cardTitleTextStyle: {
    fontSize: moderateScale(10),
    fontFamily: 'Helvetica-Bold'
  },
  cardLogoStyle: {
    fontSize: moderateScale(50)
  }
};

export default Dashboard;
