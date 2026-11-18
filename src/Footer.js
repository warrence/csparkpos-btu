import React, { Component } from 'react';
import { Text } from 'react-native';
import { Row } from 'native-base';

class Footer extends Component {
  render() {
    return (
      <Row style={{ height: 50, justifyContent: 'flex-end', alignItems: 'center', paddingRight: 10, backgroundColor: '#242424' }}>
        <Text style={{ color: this.props.color }}>Copyright {'\u00A9'} 2018 Code Squad Sdn Bhd</Text>
      </Row>
    );
  }
}

export default Footer;

