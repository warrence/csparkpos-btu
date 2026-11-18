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


export default class OffenceMaintenance extends Component {

  constructor(props) {
    super(props);

    const ds = new ListView.DataSource({rowHasChanged: (r1, r2) => r1 !== r2});
    const cities = realm.objects('Offence');
    this.state = {
      dataSource: ds.cloneWithRows(cities),
    };
  }

  componentWillMount() {

  }

  renderHeader() {
    return (
       <Header>
         <HeaderCell text="City" style={dataTableStyles.headerCell} textStyle={dataTableStyles.text} />
         <HeaderCell text="Code" style={dataTableStyles.headerCell} textStyle={dataTableStyles.text} />
         <HeaderCell text="Description" style={dataTableStyles.headerCell} textStyle={dataTableStyles.text} />
         <HeaderCell text="Amount" style={dataTableStyles.headerCell} textStyle={dataTableStyles.text} />
         <HeaderCell text="Paid Day 1" style={dataTableStyles.headerCell} textStyle={dataTableStyles.text} />
         <HeaderCell text="Dis Per 1" style={dataTableStyles.headerCell} textStyle={dataTableStyles.text} />
         <HeaderCell text="Paid Day 2" style={dataTableStyles.headerCell} textStyle={dataTableStyles.text} />
         <HeaderCell text="Dis Per 2" style={dataTableStyles.headerCell} textStyle={dataTableStyles.text} />
         <HeaderCell text="Work Day Only" style={dataTableStyles.headerCell} textStyle={dataTableStyles.text} />
       </Header>
    );
  }

  renderRow(item) {
    return (
      <Row style={dataTableStyles.row}>
        <Cell style={dataTableStyles.cell} textStyle={dataTableStyles.text}>{item.city}</Cell>
        <Cell style={dataTableStyles.cell} textStyle={dataTableStyles.text}>{item.code}</Cell>
        <Cell numberOfLines={10} style={dataTableStyles.cell} textStyle={dataTableStyles.text}>{item.description}</Cell>
        <Cell style={dataTableStyles.cell} textStyle={dataTableStyles.text}>{item.amount}</Cell>
        <Cell style={dataTableStyles.cell} textStyle={dataTableStyles.text}>{item.dayPay}</Cell>
        <Cell numberOfLines={10} style={dataTableStyles.cell} textStyle={dataTableStyles.text}>{item.disPercent}</Cell>
        <Cell numberOfLines={10} style={dataTableStyles.cell} textStyle={dataTableStyles.text}>{item.dayPay2}</Cell>
        <Cell numberOfLines={10} style={dataTableStyles.cell} textStyle={dataTableStyles.text}>{item.disPercent2}</Cell>
        <Cell style={dataTableStyles.cell} textStyle={dataTableStyles.text}>{item.workingDaysOnly}</Cell>
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

