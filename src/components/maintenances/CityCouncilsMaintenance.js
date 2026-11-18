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


export default class CityCouncilsMaintenance extends Component {

  constructor(props) {
    super(props);

    const ds = new ListView.DataSource({ rowHasChanged: (r1, r2) => r1 !== r2 });
    const cities = realm.objects('City');
    this.state = {
      dataSource: ds.cloneWithRows(cities),
    };
  }

  componentWillMount() {

  }

  renderHeader() {
    return (
       <Header>
         <HeaderCell text="Code" style={dataTableStyles.headerCell} textStyle={dataTableStyles.text} />
         <HeaderCell text="Name" style={dataTableStyles.headerCell} textStyle={dataTableStyles.text} />
         <HeaderCell text="PB Exp Day" style={dataTableStyles.headerCell} textStyle={dataTableStyles.text} />
         <HeaderCell text="PA Exp Day" style={dataTableStyles.headerCell} textStyle={dataTableStyles.text} />
         <HeaderCell text="PA Exp Rate" style={dataTableStyles.headerCell} textStyle={dataTableStyles.text} />
         <HeaderCell text="Allow Overdue PB" style={dataTableStyles.headerCell} textStyle={dataTableStyles.text} />
         <HeaderCell text="Address 1" style={dataTableStyles.headerCell} textStyle={dataTableStyles.text} />
         <HeaderCell text="Address 2" style={dataTableStyles.headerCell} textStyle={dataTableStyles.text} />
         <HeaderCell text="Address 3" style={dataTableStyles.headerCell} textStyle={dataTableStyles.text} />
         <HeaderCell text="Telephone" style={dataTableStyles.headerCell} textStyle={dataTableStyles.text} />
         <HeaderCell text="GST Reg. No." style={dataTableStyles.headerCell} textStyle={dataTableStyles.text} />
       </Header>
    );
  }

  renderRow(item) {
    return (
      <Row style={dataTableStyles.row}>
        <Cell style={dataTableStyles.cell} textStyle={dataTableStyles.text}>{item.code}</Cell>
        <Cell numberOfLines={10} style={dataTableStyles.cell} textStyle={dataTableStyles.text}>{item.name}</Cell>
        <Cell style={dataTableStyles.cell} textStyle={dataTableStyles.text}>{item.opExpiryDay}</Cell>
        <Cell style={dataTableStyles.cell} textStyle={dataTableStyles.text}>{item.compoundExpiryDay}</Cell>
        <Cell style={dataTableStyles.cell} textStyle={dataTableStyles.text}>{item.expiryPaRate}</Cell>
        <Cell style={dataTableStyles.cell} textStyle={dataTableStyles.text}>{item.allowOverduePa}</Cell>
        <Cell numberOfLines={10} style={dataTableStyles.cell} textStyle={dataTableStyles.text}>{item.address1}</Cell>
        <Cell numberOfLines={10} style={dataTableStyles.cell} textStyle={dataTableStyles.text}>{item.address2}</Cell>
        <Cell numberOfLines={10} style={dataTableStyles.cell} textStyle={dataTableStyles.text}>{item.address3}</Cell>
        <Cell style={dataTableStyles.cell} textStyle={dataTableStyles.text}>{item.telephone}</Cell>
        <Cell style={dataTableStyles.cell} textStyle={dataTableStyles.text}>{item.gstRegNo}</Cell>
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

