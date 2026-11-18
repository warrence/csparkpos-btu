import {reviewReceiptRemoval} from '../../payments/receiptRemovalUI';
import {inject, observer} from 'mobx-react';
import React, { Component } from 'react';
import {
  Container,
  Content,
  Text, Button
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
import {opMaintenanceRows} from '../../payments/opMaintenance';
import { dataTableStyles } from '../../styles/dataTableStyles';
import moment from 'moment';
import _ from 'lodash';


export class OpReceiptViewMaintenance extends Component {

  constructor(props) {
    super(props);
    this.renderRow=this.renderRow.bind(this);

    const ds = new ListView.DataSource({ rowHasChanged: (r1, r2) => r1 !== r2 });
    const opReceiptHeader = opMaintenanceRows(realm).reduce((rows, row) => {rows[row.rowKey] = row; return rows;}, {});
    this.state = {
      dataSource: ds.cloneWithRows(opReceiptHeader),
    };
  }

  componentWillMount() {

  }

  refreshRows() {
    const ds = new ListView.DataSource({rowHasChanged:(a,b)=>a!==b});
    this.setState({dataSource:ds.cloneWithRows(opMaintenanceRows(realm).reduce((rows,row)=>{rows[row.rowKey||row.receiptNo]=row;return rows;},{}))});
  }
  removeRow(row) {
    const kind = row.rowKey && row.rowKey.startsWith('an:') ? 'an' : 'op';
    reviewReceiptRemoval(this,realm,[{kind,receiptNo:row.receiptNo}],()=>this.refreshRows());
  }

  renderHeader() {
    return (
       <Header>
         <HeaderCell text="Receipt No" style={dataTableStyles.headerCell} textStyle={dataTableStyles.text} />
         <HeaderCell text="Pondok ID" style={dataTableStyles.headerCell} textStyle={dataTableStyles.text} />
         <HeaderCell text="User ID" style={dataTableStyles.headerCell} textStyle={dataTableStyles.text} />
         <HeaderCell text="Receipt Date" style={dataTableStyles.headerCell} textStyle={dataTableStyles.text} />
         <HeaderCell text="City / Source / Status" style={dataTableStyles.headerCell} textStyle={dataTableStyles.text} />
         <HeaderCell text="Items" style={dataTableStyles.headerCell} textStyle={dataTableStyles.text} />
         <HeaderCell text="Action" style={dataTableStyles.headerCell} textStyle={dataTableStyles.text} />
         </Header>
    );
  }

  renderRow(item) {
    return (
      <Row style={dataTableStyles.row}>
        <Cell style={dataTableStyles.cell} textStyle={dataTableStyles.text}>{item.receiptNo}</Cell>
        <Cell style={dataTableStyles.cell} textStyle={dataTableStyles.text}>{item.pondokId}</Cell>
        <Cell style={dataTableStyles.cell} textStyle={dataTableStyles.text}>{item.userName}</Cell>
        <Cell style={dataTableStyles.cell} textStyle={dataTableStyles.text}>{moment(item.receiptDate).format('DD/MM/YYYY')}</Cell>
        <Cell style={dataTableStyles.cell} textStyle={dataTableStyles.text}>{[item.city, item.source, item.status].filter(Boolean).join(' / ')}</Cell>
        <Cell numberOfLines={10} style={dataTableStyles.cell} textStyle={dataTableStyles.text}>
          {item.items.map((item) => {
            return (
              <Row><Text>{item.opNo}</Text></Row>
            );
          })}
        </Cell>
        <Cell style={dataTableStyles.cell}><Button danger onPress={()=>this.removeRow(item)}><Text>Delete</Text></Button></Cell>
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
            enableEmptySections
          />
        </Content>
      </Container>
    );
  }
}


export default inject('authStore')(observer(OpReceiptViewMaintenance));
