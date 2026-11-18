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
import { dataTableStyles } from '../../styles/dataTableStyles';
import moment from 'moment';
import _ from 'lodash';
import { View } from 'react-native';


export class MBillReceiptViewMaintenance extends Component {

  constructor(props) {
    super(props);
    this.renderRow=this.renderRow.bind(this);
    const ds = new ListView.DataSource({ rowHasChanged: (r1, r2) => r1 !== r2 });
    const MBillReceiptHeader = realm.objects('MBillReceiptHeader').sorted('receiptDate', true);
    this.state = {
      dataSource: ds.cloneWithRows(MBillReceiptHeader),
    };
    console.log(this.state.dataSource);
  }

  componentWillMount() {

  }

  refreshRows() {
    const ds = new ListView.DataSource({rowHasChanged:(a,b)=>a!==b});
    this.setState({dataSource:ds.cloneWithRows(Array.from(realm.objects('MBillReceiptHeader')).reduce((rows,row)=>{rows[row.rowKey||row.receiptNo]=row;return rows;},{}))});
  }
  removeRow(row) {
    const kind = row.rowKey && row.rowKey.startsWith('an:') ? 'an' : 'mbill';
    reviewReceiptRemoval(this,realm,[{kind,receiptNo:row.receiptNo}],()=>this.refreshRows());
  }

  renderHeader() {
    return (
       <Header>
         <HeaderCell text="Receipt No" style={dataTableStyles.headerCell} textStyle={dataTableStyles.text} />
         <HeaderCell text="Pondok ID" style={dataTableStyles.headerCell} textStyle={dataTableStyles.text} />
         <HeaderCell text="User ID" style={dataTableStyles.headerCell} textStyle={dataTableStyles.text} />
         <HeaderCell text="Receipt Date" style={dataTableStyles.headerCell} textStyle={dataTableStyles.text} />
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
       
        <Cell numberOfLines={10} style={dataTableStyles.cell} textStyle={dataTableStyles.text}>
          {item.items.map((item) => {
            return (
                <View>
                <Row><Text>MBill No:{item.mBillNo}</Text></Row>
                <Row><Text>City:{item.city}</Text></Row>
                <Row><Text>Amount:{item.amount}</Text></Row>
                </View>
              
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


export default inject('authStore')(observer(MBillReceiptViewMaintenance));
