import React, { Component } from 'react';
import {
  Container,
  Content,
} from 'native-base';
import {
  Cell,
  DataTable,
  Header,
  HeaderCell,
  Row,
} from 'react-native-data-table';
import { ListView } from 'realm/react-native';
import realm from '../../realm';
import { dataTableStyles } from '../../styles/dataTableStyles';


export default class HolidaysMaintenance extends Component {

  constructor(props) {
    super(props);

    const ds = new ListView.DataSource({rowHasChanged: (r1, r2) => r1 !== r2});
    const cities = realm.objects('Holiday').sorted('holidayDate', true);
    this.state = {
      dataSource: ds.cloneWithRows(cities),
    };
  }

  componentWillMount() {

  }

  renderHeader() {
    return (
       <Header>
         <HeaderCell text="Holiday Name" style={dataTableStyles.headerCell} textStyle={dataTableStyles.text} />
         <HeaderCell text="Holiday Date" style={dataTableStyles.headerCell} textStyle={dataTableStyles.text} />
         </Header>
    );
  }

  renderRow(item) {
    return (
      <Row style={dataTableStyles.row}>
        <Cell style={dataTableStyles.cell} textStyle={dataTableStyles.text}>{item.holidayName}</Cell>
        <Cell style={dataTableStyles.cell} textStyle={dataTableStyles.text}>{item.holidayDate.toDateString()}</Cell>
        </Row>
    );
  }

  render() {

    return (
      <Container>
        <Content style={{ backgroundColor: 'white' }}>
          <DataTable
            style={dataTableStyles.container}
            listViewStyle={dataTableStyles.container}
            dataSource={this.state.dataSource}
            renderRow={this.renderRow}
            renderHeader={this.renderHeader}
            scrollable={this.scrollable}
          />
        </Content>
      </Container>
    );
  }
}

