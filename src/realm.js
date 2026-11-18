import Realm from 'realm';

const GeneralProfile = {
  name: 'GeneralProfile',
  properties: {
    companyName: 'string',
    shortName: 'string?',
    Address1: 'string?',
    Address2: 'string?',
    Address3: 'string?',
    Telephone1: 'string?',
    Telephone2: 'string?',
    Telephone3: 'string?',
    Telephone4: 'string?',
    Fax1: 'string?',
    Fax2: 'string?',
    Email1: 'string?',
    Email2: 'string?',
    Email3: 'string?',
    Website: 'string?',
    Currency: 'string?',
    CompanyNo: 'string',
    GstRegNo: 'string?',
    PondokId: 'string',
    PondokName: 'string?',
    PondokCity: 'string',
    PondokArea: 'string',
    Tax: { type: 'int', default: 0 },
    TaxCode: 'string?',
    CouponReceiptPrefix: 'string',
    OpReceiptPrefix: 'string',
    PaReceiptPrefix: 'string',
    MBillReceiptPrefix: 'string',
    CouponReceiptNo: { type: 'int', default: 0 },
    OpReceiptNo: { type: 'int', default: 0 },
    PaReceiptNo: { type: 'int', default: 0 },
    MBillReceiptNo: { type: 'int', default: 0 },
    printerAddress: 'string?'
  }
};

const City = {
  name: 'City',
  properties: {
    code: 'string',
    name: 'string',
    opExpiryDay: { type: 'int', default: 0 },
    compoundExpiryDay: { type: 'int', default: 0 },
    expiryPaRate: { type: 'double', default: 0 },
    address1: 'string',
    address2: 'string',
    address3: 'string',
    telephone: 'string',
    gstRegNo: 'string',
    allowOverduePa: { type: 'bool', default: false }
  }
};

const Holiday = {
  name: 'Holiday',
  properties: {
    holidayName: 'string',
    holidayDate: { type: 'date' }
  }
};

const Pass = {
  name: 'Pass',
  properties: {
    employeeId: 'string',
    employeeName: 'string',
    employeePassword: 'string',
    employeeLevel: 'int'
  }
};

const OpTable = {
  name: 'OpTable',
  properties: {
    amount: 'double',
    //couponType: {type: 'int', default: 0},
    //couponQty: {type: 'int', default: 0},
    //Ind: 'string'
  }
};

const Offence = {
  name: 'Offence',
  properties: {
    city: 'string',
    code: 'string',
    description: 'string',
    amount: 'double',
    dayPay: { type: 'int', default: 0 },
    disPercent: 'double',
    dayPay2: { type: 'int', default: 0 },
    disPercent2: 'double',
    workingDaysOnly: 'bool',
    allowEdit: { type: 'bool', default: false }
  }
};


const Coupon = {
  name: 'Coupon',
  properties: {
    couponNo: { type: 'string', indexed: true },
    couponType: { type: 'int' },
    issueDate: 'date'
  }
};

const CouponReceiptItem = {
  name: 'CouponReceiptItem',
  primaryKey: 'startingCouponNo',
  properties: {
    startingCouponNo: { type: 'string', indexed: true },
    endingCouponNo: { type: 'string', indexed: true },
    couponType: 'string',
    taxAmount: 'double',
    amount: 'double',
    tax: 'double'
  }
};

const CouponReceiptHeader = {
  name: 'CouponReceiptHeader',
  primaryKey: 'receiptNo',
  properties: {
    receiptNo: 'string',
    userName: 'string',
    receiptDate: 'date',
    pondokId: 'string',
    items: { type: 'list', objectType: 'CouponReceiptItem' }
  }
};

const OpReceiptItem = {
  name: 'OpReceiptItem',
  primaryKey: 'opNo',
  properties: {
    opNo: { type: 'string', indexed: true },
    carNo: 'string?',
    opDate: { type: 'date' },
    amount: { type: 'double' },
    taxAmount: { type: 'double' },
    tax: { type: 'double' }
  }
};

const OpReceiptHeader = {
  name: 'OpReceiptHeader',
  primaryKey: 'receiptNo',
  properties: {
    receiptNo: 'string',
    userName: 'string',
    receiptDate: 'date',
    pondokId: 'string',
    city: 'string',
    reminderNo: { type: 'string?' },
    taxPolicyVersion: 'int?',
    carNo: 'string?',
    items: { type: 'list', objectType: 'OpReceiptItem' }
  }
};

const MBillReceiptItem = {
  name: 'MBillReceiptItem',
  primaryKey: 'mBillNo',
  properties: {
    mBillNo: { type: 'string', indexed: true },
    amount: { type: 'double', default: 0 },
    taxAmount: { type: 'double', default: 0 },
    tax: { type: 'double', default: 0 },
    disAmount: { type: 'double', default: 0 },
    disPercent: { type: 'double', default: 0 },
    city: 'string',
    qrData: 'string'

  }
};

const MBillReceiptHeader = {
  name: 'MBillReceiptHeader',
  primaryKey: 'receiptNo',
  properties: {
    receiptNo: 'string',
    userName: 'string',
    receiptDate: 'date',
    pondokId: 'string',
    city: 'string',
    qrData: 'string',
    items: { type: 'list', objectType: 'MBillReceiptItem' }
  }
};

const PaReceiptItem = {
  name: 'PaReceiptItem',
  primaryKey: 'paNo',
  properties: {
    paNo: { type: 'string', indexed: true },
    paDate: { type: 'date' },
    offence: { type: 'string' },
    amount: { type: 'double', default: 0 },
    taxAmount: { type: 'double', default: 0 },
    tax: { type: 'double' },
    disAmount: { type: 'double', default: 0 },
    disPercent: { type: 'double', default: 0 },
    opAmount: { type: 'double', default: 0 }
  }
};

// Additive v29: preserve all legacy items/links, including unresolved orphans.
const PaReceiptLine = {
  name: 'PaReceiptLine', primaryKey: 'id',
  properties: {id: 'string', receiptNo: 'string', city: 'string', noticeKind: 'string',
    paNo: {type: 'string', indexed: true}, paDate: 'date', offence: 'string',
    amount: {type: 'double', default: 0}, taxAmount: {type: 'double', default: 0}, tax: 'double',
    disAmount: {type: 'double', default: 0}, disPercent: {type: 'double', default: 0},
    opAmount: {type: 'double', default: 0}}
};

const PaReceiptHeader = {
  name: 'PaReceiptHeader',
  primaryKey: 'receiptNo',
  properties: {
    receiptNo: 'string',
    userName: 'string',
    receiptDate: 'date',
    pondokId: 'string',
    city: 'string',
    carNo: 'string',
    paType: 'string',
    reminderNo: { type: 'string?' },
    items: { type: 'list', objectType: 'PaReceiptItem' },
    lines: {type: 'list', objectType: 'PaReceiptLine'},
    status: {type: 'string', default: 'pending'}, uploadedAt: 'date?', uploadPayload: 'string?'
  }
};

const AdviceRules = {
  name: 'AdviceRules', primaryKey: 'id',
  properties: {id: 'string', json: 'string', loadedAt: 'date'}
};

const AdviceReceiptItem = {
  name: 'AdviceReceiptItem', primaryKey: 'id',
  properties: {
    id: 'string', noticeNo: {type: 'string', indexed: true}, noticeDate: 'date',
    city: 'string', carNo: 'string', couponNo: 'string', baseAmount: 'double',
    excessCharge: 'double', taxRate: 'double', taxAmount: 'double', overdueFee: 'double'
  }
};

const AdviceReceiptHeader = {
  name: 'AdviceReceiptHeader', primaryKey: 'receiptNo',
  properties: {
    receiptNo: 'string', receiptDate: 'date', userName: 'string', pondokId: 'string',
    city: 'string', carNo: 'string', reminderNo: 'string?', overdue: 'bool', amountReceived: 'double?', totalAmount: 'double', rounding: 'double',
    status: {type: 'string', default: 'pending'}, postedAt: 'date?',
    postingPayload: 'string', rulesSnapshot: 'string',
    items: {type: 'list', objectType: 'AdviceReceiptItem'}
  }
};

export default new Realm({
  schema: [
    GeneralProfile,
    City,
    Holiday,
    {name: 'HolidayCalendar', primaryKey: 'id', properties: {id: 'string', json: 'string', loadedAt: 'date', revision: 'string?', serverGeneratedAt: 'date?'}},
    Pass,
    OpTable,
    Offence,
    Coupon,
    CouponReceiptHeader,
    CouponReceiptItem,
    OpReceiptHeader,
    OpReceiptItem,
    PaReceiptHeader,
    PaReceiptItem,
    PaReceiptLine,
    MBillReceiptHeader,
    MBillReceiptItem,
    {name:'LegacyPostingOutbox',primaryKey:'id',properties:{id:'string',dateKey:'string',requestId:'string',payload:'string',createdAt:'date'}},
    {name:'ReceiptRemovalArchive',primaryKey:'id',properties:{id:'string',kind:'string',receiptNo:'string',payload:'string',removedAt:'date',removedBy:'string'}},
    {name:'ReceiptUploadAttempt',primaryKey:'id',properties:{id:'string',receiptNo:'string',createdAt:'date'}},
    AdviceRules,
    AdviceReceiptItem,
    AdviceReceiptHeader
  ],
  schemaVersion: 32
});

