import React, { Component } from 'react';
import { View, Text } from 'react-native';
import {
  Container,
  Content,
  Grid,
  Row,
  Input,
  Button,
  Spinner,
  Form,
  Item,
  Label,
  Footer,
  FooterTab
} from 'native-base';
import { observer } from 'mobx-react';
import { Actions } from 'react-native-router-flux';
import { scale, moderateScale, verticalScale} from '../scaling';
import {version} from "../global";

const initState = {
  userName: '',
  password: '',
  error: '',
  loading: false
};

@observer(['authStore'])
class LoginForm extends Component {
  state = initState;
  /*onEmailChange(text) {
    this.props.emailChanged(text);
  }

  onPasswordChange(text) {
    this.props.passwordChanged(text);
  }*/

  onChangeText = (key, value) => {
    this.setState({
      [key]: value
    });
  }

  async onButtonPress() {
    this.setState({ error: '', loading: true });
    if (this.props.authStore.login(this.state)) {
      Actions.dashboard();
    }else{
      this.setState({ error: 'Invalid Username or Password!', loading: false });
    }
  }

  renderError() {
    if (this.state.error) {
      return (
        <View style={{ backgroundColor: 'white' }}>
          <Text style={styles.errorTextStyle}>
            {this.state.error}
          </Text>
        </View>
      );
    }
  }

  renderButton() {
    if (this.state.loading) {
      return <Spinner size="large" />;
    }

    return (
      <Button rounded onPress={this.onButtonPress.bind(this)} style={styles.buttonStyle}>
        <Text style={{ color: 'white', fontWeight: 'bold' }}>Login</Text>
      </Button>
    );
  }

  render() {
    const { containerStyle, rowStyle, logoStyle } = styles;

    return (
      <Container style={containerStyle}>
        <Content>
          <Grid style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <Row style={rowStyle}>
              <Text style={logoStyle}>CS Park POS</Text>
            </Row>
            <Row>
              <Text>Ver. {version}</Text>
            </Row>
            <Row style={rowStyle}>
              <Form style={{ width: moderateScale(200) }}>
                <Item floatingLabel>
                  <Label>Username</Label>
                  <Input
                    onChangeText={value => this.onChangeText('userName', value)}
                    value={this.state.userName}
                  />
                </Item>
                <Item floatingLabel>
                  <Label>Password</Label>
                  <Input
                    secureTextEntry
                    onChangeText={value => this.onChangeText('password', value)}
                    value={this.state.password}
                  />
                </Item>
              </Form>
            </Row>
            <Row style={rowStyle}>
              {this.renderError()}
            </Row>
            <Row style={{ height: moderateScale(20) }}>
            </Row>
            <Row style={rowStyle}>
              {this.renderButton()}
            </Row>
          </Grid>
        </Content>
        <Footer>
          <FooterTab>
            <Button vertical>
              <Text>Apps</Text>
            </Button>
          </FooterTab>
        </Footer>
      </Container>

    );
  }
}

const styles = {
  errorTextStyle: {
    fontSize: moderateScale(10),
    alignSelf: 'center',
    color: 'red'
  },
  containerStyle: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'white'
  },
  rowStyle: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoStyle: {
    fontSize: moderateScale(50),
    //fontWeight: 'bold',
    color: '#66B2DB',
    fontFamily: 'HelveticaNeue-CondensedBlack'
  },
  buttonStyle: {
    width: moderateScale(100),
    justifyContent: 'center'
  }
};

export default LoginForm;

