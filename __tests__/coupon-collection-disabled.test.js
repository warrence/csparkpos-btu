// Bintulu-only collection switch. Synthetic data; no live money or printer.
import React from 'react';
import renderer from 'react-test-renderer';
import {Alert} from 'react-native';
let mockRows;
const mockPrint=jest.fn();
const mockWrite=jest.fn();
const mockCreate=jest.fn();
const mockDelete=jest.fn();
jest.mock('../src/realm',()=>({objects:name=>{const rows=mockRows[name]||[];rows.sorted=()=>rows;return rows;},write:(...args)=>mockWrite(...args),create:(...args)=>mockCreate(...args),delete:(...args)=>mockDelete(...args)}));
jest.mock('../src/printReceipt',()=>jest.fn().mockImplementation(()=>({print:mockPrint})));
jest.mock('mobx-react',()=>({inject:()=>target=>target,observer:target=>target}));
jest.mock('../src/helpers',()=>({bnmRound:value=>value}));
const Coupon=require('../src/components/payments/CouponPayment').default;
const find=(tree,id)=>tree.root.findAll(node=>node.props.testID===id)[0];
beforeEach(()=>{jest.clearAllMocks();jest.spyOn(Alert,'alert').mockImplementation(()=>{});mockRows={GeneralProfile:[{CouponReceiptNo:41,PondokCity:'Bintulu'}],Coupon:[{couponNo:'QA001',couponType:100}],CouponReceiptHeader:[{receiptNo:'CP-P1-41',items:[{startingCouponNo:'QA001',amount:1,taxAmount:.06}]}]};});
afterEach(()=>jest.restoreAllMocks());
test('new coupon fields and Add/Pay are disabled while historical reprint remains available',()=>{
 const tree=renderer.create(<Coupon generalStore={{Tax:6}} authStore={{userName:'FIXTURE'}}/>);
 expect(find(tree,'coupon-add').props.disabled).toBe(true);expect(find(tree,'coupon-pay').props.disabled).toBe(true);
 expect(find(tree,'coupon-quantity').props.editable).toBe(false);expect(find(tree,'coupon-starting-number').props.editable).toBe(false);
 expect(find(tree,'coupon-disabled-notice').props.children).toContain('disabled for Bintulu');
 expect(find(tree,'coupon-reprint').props.disabled).not.toBe(true);
 const before=JSON.stringify(mockRows);renderer.act(()=>tree.getInstance().handleReprint());
 expect(mockPrint).toHaveBeenCalledWith('coupon','CP-P1-41');expect(JSON.stringify(mockRows)).toBe(before);tree.unmount();
});
test.each(['Bintulu','BTU','OTHER',undefined])('direct Add/Pay cannot bypass this Bintulu build switch with profile city %j',city=>{
 mockRows.GeneralProfile[0].PondokCity=city;
 const view=new Coupon();view.props={generalStore:{Tax:6},authStore:{userName:'FIXTURE'}};view.setState=v=>Object.assign(view.state,v);
 view.state.qty=1;view.state.startingCouponNo='QA001';view.state.total=1.06;
 view.state.data=[{startingCouponNo:'QA001',endingCouponNo:'QA001',quantity:1,couponType:100,price:1,taxAmount:.06}];
 const before=JSON.stringify(mockRows),draft=JSON.stringify(view.state.data);
 view.addItem();view.processPayment();
 expect(mockWrite).not.toHaveBeenCalled();expect(mockCreate).not.toHaveBeenCalled();expect(mockDelete).not.toHaveBeenCalled();expect(mockPrint).not.toHaveBeenCalled();
 expect(JSON.stringify(mockRows)).toBe(before);expect(JSON.stringify(view.state.data)).toBe(draft);expect(view.state.total).toBe(1.06);
 expect(Alert.alert).toHaveBeenCalledWith('Coupon sales disabled',expect.stringContaining('Bintulu'));
});
