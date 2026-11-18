import React, { Component } from 'react';
import {
  Container,
  Content,
  Text,
  List,
  ListItem,
  Body,
  Left,
} from 'native-base';
import realm from '../../realm';
import { moderateScale } from '../../scaling';

export default class GeneralProfileMaintenance extends Component {

  constructor(props) {
    super(props);
    this.state = {
      data: null,
    };
  }

  render() {
    const generalProfile = realm.objects('GeneralProfile')[0];

    return (
      <Container>
        <Content style={{ backgroundColor: 'white' }}>
          <List>
           <ListItem icon>
             <Left style={styles.leftStyles}>
              <Text style={styles.labelStyles}>Company Name</Text>
             </Left>
             <Body>
              <Text style={styles.valueStyles}>{generalProfile.companyName}</Text>
             </Body>
           </ListItem>

            <ListItem icon>
              <Left style={styles.leftStyles}>
                <Text style={styles.labelStyles}>Short Name</Text>
              </Left>
              <Body>
              <Text style={styles.valueStyles}>{generalProfile.shortName}</Text>
              </Body>
            </ListItem>

            <ListItem icon>
              <Left style={styles.leftStyles}>
                <Text style={styles.labelStyles}>Address 1</Text>
              </Left>
              <Body>
              <Text style={styles.valueStyles}>{generalProfile.Address1}</Text>
              </Body>
            </ListItem>

            <ListItem icon>
              <Left style={styles.leftStyles}>
                <Text style={styles.labelStyles}>Address 2</Text>
              </Left>
              <Body>
              <Text style={styles.valueStyles}>{generalProfile.Address2}</Text>
              </Body>
            </ListItem>

            <ListItem icon>
              <Left style={styles.leftStyles}>
                <Text style={styles.labelStyles}>Address 3</Text>
              </Left>
              <Body>
              <Text style={styles.valueStyles}>{generalProfile.Address3}</Text>
              </Body>
            </ListItem>

            <ListItem icon>
              <Left style={styles.leftStyles}>
                <Text style={styles.labelStyles}>Telephone 1</Text>
              </Left>
              <Body>
              <Text style={styles.valueStyles}>{generalProfile.Telephone1}</Text>
              </Body>
            </ListItem>

            <ListItem icon>
              <Left style={styles.leftStyles}>
                <Text style={styles.labelStyles}>Telephone 2</Text>
              </Left>
              <Body>
              <Text style={styles.valueStyles}>{generalProfile.Telephone2}</Text>
              </Body>
            </ListItem>

            <ListItem icon>
              <Left style={styles.leftStyles}>
                <Text style={styles.labelStyles}>Telephone 3</Text>
              </Left>
              <Body>
              <Text style={styles.valueStyles}>{generalProfile.Telephone3}</Text>
              </Body>
            </ListItem>

            <ListItem icon>
              <Left style={styles.leftStyles}>
                <Text style={styles.labelStyles}>Telephone 4</Text>
              </Left>
              <Body>
              <Text style={styles.valueStyles}>{generalProfile.Telephone4}</Text>
              </Body>
            </ListItem>

            <ListItem icon>
              <Left style={styles.leftStyles}>
                <Text style={styles.labelStyles}>Fax 1</Text>
              </Left>
              <Body>
              <Text style={styles.valueStyles}>{generalProfile.fax1}</Text>
              </Body>
            </ListItem>

            <ListItem icon>
              <Left style={styles.leftStyles}>
                <Text style={styles.labelStyles}>Fax 2</Text>
              </Left>
              <Body>
              <Text style={styles.valueStyles}>{generalProfile.fax2}</Text>
              </Body>
            </ListItem>

            <ListItem icon>
              <Left style={styles.leftStyles}>
                <Text style={styles.labelStyles}>Email 1</Text>
              </Left>
              <Body>
              <Text style={styles.valueStyles}>{generalProfile.Email1}</Text>
              </Body>
            </ListItem>

            <ListItem icon>
              <Left style={styles.leftStyles}>
                <Text style={styles.labelStyles}>Email 2</Text>
              </Left>
              <Body>
              <Text style={styles.valueStyles}>{generalProfile.Email2}</Text>
              </Body>
            </ListItem>

            <ListItem icon>
              <Left style={styles.leftStyles}>
                <Text style={styles.labelStyles}>Email 3</Text>
              </Left>
              <Body>
              <Text style={styles.valueStyles}>{generalProfile.Email3}</Text>
              </Body>
            </ListItem>

            <ListItem icon>
              <Left style={styles.leftStyles}>
                <Text style={styles.labelStyles}>Website</Text>
              </Left>
              <Body>
              <Text style={styles.valueStyles}>{generalProfile.Website}</Text>
              </Body>
            </ListItem>

            <ListItem icon>
              <Left style={styles.leftStyles}>
                <Text style={styles.labelStyles}>Currency</Text>
              </Left>
              <Body>
              <Text style={styles.valueStyles}>{generalProfile.Currency}</Text>
              </Body>
            </ListItem>

            <ListItem icon>
              <Left style={styles.leftStyles}>
                <Text style={styles.labelStyles}>Company Reg. No.</Text>
              </Left>
              <Body>
              <Text style={styles.valueStyles}>{generalProfile.CompanyNo}</Text>
              </Body>
            </ListItem>

            <ListItem icon>
              <Left style={styles.leftStyles}>
                <Text style={styles.labelStyles}>GST Reg. No.</Text>
              </Left>
              <Body>
              <Text style={styles.valueStyles}>{generalProfile.GstRegNo}</Text>
              </Body>
            </ListItem>

            <ListItem icon>
              <Left style={styles.leftStyles}>
                <Text style={styles.labelStyles}>Tax Code</Text>
              </Left>
              <Body>
              <Text style={styles.valueStyles}>{generalProfile.TaxCode}</Text>
              </Body>
            </ListItem>

            <ListItem icon>
              <Left style={styles.leftStyles}>
                <Text style={styles.labelStyles}>Tax</Text>
              </Left>
              <Body>
              <Text style={styles.valueStyles}>{generalProfile.Tax}%</Text>
              </Body>
            </ListItem>

            <ListItem icon>
              <Left style={styles.leftStyles}>
                <Text style={styles.labelStyles}>Pondok ID</Text>
              </Left>
              <Body>
              <Text style={styles.valueStyles}>{generalProfile.PondokId}</Text>
              </Body>
            </ListItem>

            <ListItem icon>
              <Left style={styles.leftStyles}>
                <Text style={styles.labelStyles}>Pondok Name</Text>
              </Left>
              <Body>
              <Text style={styles.valueStyles}>{generalProfile.PondokName}</Text>
              </Body>
            </ListItem>

            <ListItem icon>
              <Left style={styles.leftStyles}>
                <Text style={styles.labelStyles}>Pondok City</Text>
              </Left>
              <Body>
              <Text style={styles.valueStyles}>{generalProfile.PondokCity}</Text>
              </Body>
            </ListItem>

            <ListItem icon>
              <Left style={styles.leftStyles}>
                <Text style={styles.labelStyles}>Pondok Area</Text>
              </Left>
              <Body>
              <Text style={styles.valueStyles}>{generalProfile.PondokArea}</Text>
              </Body>
            </ListItem>

            <ListItem icon>
              <Left style={styles.leftStyles}>
                <Text style={styles.labelStyles}>Coupon Receipt Prefix</Text>
              </Left>
              <Body>
              <Text style={styles.valueStyles}>{generalProfile.CouponReceiptPrefix}</Text>
              </Body>
            </ListItem>

            <ListItem icon>
              <Left style={styles.leftStyles}>
                <Text style={styles.labelStyles}>Coupon Last Receipt No</Text>
              </Left>
              <Body>
              <Text style={styles.valueStyles}>{generalProfile.CouponReceiptNo}</Text>
              </Body>
            </ListItem>

            <ListItem icon>
              <Left style={styles.leftStyles}>
                <Text style={styles.labelStyles}>OP Receipt Prefix</Text>
              </Left>
              <Body>
              <Text style={styles.valueStyles}>{generalProfile.OpReceiptPrefix}</Text>
              </Body>
            </ListItem>

            <ListItem icon>
              <Left style={styles.leftStyles}>
                <Text style={styles.labelStyles}>OP Last Receipt No</Text>
              </Left>
              <Body>
              <Text style={styles.valueStyles}>{generalProfile.OpReceiptNo}</Text>
              </Body>
            </ListItem>

            <ListItem icon>
              <Left style={styles.leftStyles}>
                <Text style={styles.labelStyles}>PA Receipt Prefix</Text>
              </Left>
              <Body>
              <Text style={styles.valueStyles}>{generalProfile.PaReceiptPrefix}</Text>
              </Body>
            </ListItem>

            <ListItem icon>
              <Left style={styles.leftStyles}>
                <Text style={styles.labelStyles}>PA Last Receipt No</Text>
              </Left>
              <Body>
              <Text style={styles.valueStyles}>{generalProfile.PaReceiptNo}</Text>
              </Body>
            </ListItem>

            <ListItem icon>
              <Left style={styles.leftStyles}>
                <Text style={styles.labelStyles}>Mbill Receipt Prefix</Text>
              </Left>
              <Body>
              <Text style={styles.valueStyles}>{generalProfile.MBillReceiptPrefix}</Text>
              </Body>
            </ListItem>

            <ListItem icon>
              <Left style={styles.leftStyles}>
                <Text style={styles.labelStyles}>MBILL Last Receipt No</Text>
              </Left>
              <Body>
              <Text style={styles.valueStyles}>{generalProfile.MBillReceiptNo}</Text>
              </Body>
            </ListItem>

            <ListItem icon>
              <Left style={styles.leftStyles}>
                <Text style={styles.labelStyles}>Printer Address</Text>
              </Left>
              <Body>
              <Text style={styles.valueStyles}>{generalProfile.printerAddress}</Text>
              </Body>
            </ListItem>


          </List>
        </Content>
      </Container>
    );
  }
}

const styles = {
  leftStyles: {
    width: moderateScale(120),
    justifyContent: 'flex-end'
  },
  labelStyles: {
    fontSize: moderateScale(8),
    fontWeight: 'bold'
  },
  valueStyles: {
    fontSize: moderateScale(8)
  }
};

