// Test double only; does not claim to exercise Realm's native disk/migration code.
function copy(value, seen = new Map()) {
  if (!value || typeof value !== 'object') return value;
  if (seen.has(value)) return seen.get(value);
  const result = value instanceof Date ? new Date(value) : Array.isArray(value) ? [] : {};
  seen.set(value,result);
  if (!(value instanceof Date)) Object.keys(value).forEach(key => {result[key] = copy(value[key],seen);});
  return result;
}
class Results extends Array {
  sorted(field,descending=false){return Results.from([...this].sort((a,b)=>(a[field]>b[field]?1:a[field]<b[field]?-1:0)*(descending?-1:1)));}
  filtered(query, ...args) {
    return Results.from(this.filter(row => {
      if (query.includes('receiptDate')) return row.receiptDate >= args[0] && row.receiptDate < args[1] && (args.length < 3 || row.status === args[2]);
      if (query.includes('noticeNo')) return row.city === args[0] && row.noticeNo === args[1];
      if (query.includes('receiptNo')) return row.receiptNo === (args[0] || query.match(/receiptNo\s*=\s*"([^"]+)"/)[1]);
      throw new Error('Unexpected fixture query: ' + query);
    }));
  }
  sum(key) { return this.reduce((sum, row) => sum + row[key], 0); }
}
export const RULES = {calendarDays: 4, overdueFee: '7.02', taxEnabled: true,
  windowIncludesCollectionDate: true, rounding: 'nearest_0.05_on_notice_net_and_tax'};
export const CONFIG = {protocolVersion: 1, configured: true, rules: RULES};
export function memoryRealm() {
  const db = {
    tables: {ReceiptRemovalArchive: [], ReceiptUploadAttempt: [], HolidayCalendar: [{id: 'current', json: '[]', loadedAt: new Date()}], GeneralProfile: [{PondokId: 'P1', OpReceiptPrefix: 'OP', PaReceiptPrefix: 'PA', OpReceiptNo: 40, PaReceiptNo: 70}],
      AdviceRules: [{id: 'current', json: JSON.stringify(CONFIG), loadedAt: new Date()}], City: [{code: 'BTU', name: 'Fixture', opExpiryDay: 14, compoundExpiryDay: 60, allowOverduePa: false}]},
    objects(name) { if (!this.tables[name]) this.tables[name] = []; return Results.from(this.tables[name]); },
    objectForPrimaryKey(name, key) { return this.objects(name).find(row => (['ReceiptRemovalArchive','ReceiptUploadAttempt'].includes(name) ? row.id : (row.receiptNo || row.id)) === key); },
    write(callback) {const before = copy(this.tables);try {callback();} catch (error) {this.tables = before;throw error;}},
    delete(value) {
      const targets = new Set(Array.isArray(value) ? value : [value]);
      Object.keys(this.tables).forEach(name => {this.tables[name] = this.tables[name].filter(row => !targets.has(row));});
    },
    create(name, value, update) {
      const key = name.endsWith('ReceiptHeader') ? 'receiptNo' : name==='PaReceiptItem' ? 'paNo' : 'id';
      const existing = this.objects(name).find(row => row[key] === value[key]);
      if (existing && update) {Object.assign(existing, copy(value));return existing;}
      if (existing) throw new Error('Duplicate fixture key');
      const row = copy(value);
      if (name === 'AdviceReceiptHeader') {
        row.items.forEach(item => {this.objects('AdviceReceiptItem');this.tables.AdviceReceiptItem.push(item);});
      }
      this.tables[name].push(row);return row;
    },
  };
  return db;
}

// Explicitly materialize native Realm link tables for transport fixtures that assign headers directly.
export function materializeReceiptLinks(db) {
 const maps={OpReceiptHeader:[['items','OpReceiptItem']],PaReceiptHeader:[['items','PaReceiptItem'],['lines','PaReceiptLine']],CouponReceiptHeader:[['items','CouponReceiptItem']],MBillReceiptHeader:[['items','MBillReceiptItem']]};
 Object.keys(maps).forEach(table=>maps[table].forEach(([list,child])=>{
  db.objects(child);(db.tables[table]||[]).forEach(row=>(row[list]||[]).forEach(item=>{if(!db.tables[child].includes(item))db.tables[child].push(item);}));
 }));
}
