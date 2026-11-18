import React, { Component } from 'react';
import {
  Container,
  Text,
  Grid,
  Row,
  Col,
  Card,
  Body,
  CardItem,
  Icon
} from 'native-base';
import Footer from '../Footer';
import { Actions } from 'react-native-router-flux';
import { moderateScale } from '../scaling';

export default class Maintenance extends Component {

  componentWillMount() {

  }

  render() {
    return (
      <Container style={styles.containerStyle}>
        <Grid>
          <Row>
            <Col>
              <Card style={styles.cardStyle}>
                <CardItem button style={{ flex: 1, backgroundColor: '#f9ff00' }} onPress={() => Actions.generalProfileMaintenance()}>
                  <Body style={styles.cardBodyStyle}>
                    <Icon type="SimpleLineIcons" name="info" style={styles.cardLogoStyle} />
                    <Text style={styles.cardTitleTextStyle}>General Profile</Text>
                  </Body>
                </CardItem>
              </Card>
            </Col>
            <Col>
              <Card style={styles.cardStyle}>
                <CardItem button style={{ flex: 1, backgroundColor: '#ff0002' }} onPress={() => Actions.cityCouncilMaintenance()}>
                  <Body style={styles.cardBodyStyle}>
                  <Icon type="MaterialIcons" name="location-city" style={styles.cardLogoStyle} />
                  <Text style={styles.cardTitleTextStyle}>City Councils</Text>
                  </Body>
                </CardItem>
              </Card>
            </Col>
            <Col>
              <Card style={styles.cardStyle}>
                <CardItem button style={{ flex: 1, backgroundColor: '#00ecff' }} onPress={() => Actions.holidayMaintenance()}>
                  <Body style={styles.cardBodyStyle}>
                  <Icon type="MaterialIcons" name="today" style={styles.cardLogoStyle} />
                  <Text style={styles.cardTitleTextStyle}>Holidays</Text>
                  </Body>
                </CardItem>
              </Card>
            </Col>
          </Row>
          <Row>
            <Col>
              <Card style={styles.cardStyle}>
                <CardItem button style={{ flex: 1, backgroundColor: '#ff00fb' }} onPress={() => Actions.offenceMaintenance()}>
                  <Body style={styles.cardBodyStyle}>
                  <Icon type="MaterialIcons" name="block" style={styles.cardLogoStyle} />
                  <Text style={styles.cardTitleTextStyle}>Offences</Text>
                  </Body>
                </CardItem>
              </Card>
            </Col>
            <Col>
              <Card style={styles.cardStyle}>
                <CardItem button style={{ flex: 1, backgroundColor: '#ffffff' }} onPress={() => Actions.couponMaintenance()}>
                  <Body style={styles.cardBodyStyle}>
                  <Icon type="Entypo" name="documents" style={styles.cardLogoStyle} />
                  <Text style={styles.cardTitleTextStyle}>Coupons</Text>
                  </Body>
                </CardItem>
              </Card>
            </Col>
            <Col>
              <Card style={styles.cardStyle}>
                <CardItem button style={{ flex: 1, backgroundColor: '#0cff00' }} onPress={() => Actions.opTableMaintenance()}>
                  <Body style={styles.cardBodyStyle}>
                  <Icon type="MaterialIcons" name="attach-money" style={styles.cardLogoStyle} />
                  <Text style={styles.cardTitleTextStyle}>PB Rate</Text>
                  </Body>
                </CardItem>
              </Card>
            </Col>
          </Row>
          <Row>
            <Col>
              <Col>
                <Card style={styles.cardStyle}>
                  <CardItem button style={{ flex: 1, backgroundColor: '#ff8500' }} onPress={() => Actions.receiptMaintenance()}>
                    <Body style={styles.cardBodyStyle}>
                    <Icon type="MaterialIcons" name="receipt" style={styles.cardLogoStyle} />
                    <Text style={styles.cardTitleTextStyle}>Receipts</Text>
                    </Body>
                  </CardItem>
                </Card>
              </Col>
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
