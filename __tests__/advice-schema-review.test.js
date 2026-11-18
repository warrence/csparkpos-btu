// Configuration comparison only: does not open a native Realm file.
jest.mock('realm', () => jest.fn(config => config));
import finalConfiguration from '../src/realm';
const v31Configuration={...finalConfiguration,schemaVersion:31,schema:finalConfiguration.schema.filter(row=>!['ReceiptRemovalArchive','ReceiptUploadAttempt'].includes(row.name))};
const latestConfiguration={...v31Configuration,schemaVersion:30,schema:v31Configuration.schema.filter(row=>row.name!=='LegacyPostingOutbox')};
import schema29 from '../test-support/fixtures/realm-schema-29.json';
const currentConfiguration={...latestConfiguration,schemaVersion:29,schema:latestConfiguration.schema.map(row=>{if(!['OpReceiptHeader','OpReceiptItem'].includes(row.name))return row;const properties={...row.properties};delete properties.carNo;return {...row,properties};})};
// Retain all prior migration assertions against the v28 portion of the additive v29 schema.
const configuration={...currentConfiguration,schemaVersion:28,schema:currentConfiguration.schema.filter(row=>row.name!=='PaReceiptLine').map(row=>{if(row.name!=='PaReceiptHeader')return row;const properties={...row.properties};['lines','status','uploadedAt','uploadPayload'].forEach(key=>delete properties[key]);return {...row,properties};})};
import baseline from '../test-support/fixtures/realm-schema-23.json';
import previous from '../test-support/fixtures/realm-schema-24.json';

test('schema 23->28 retains every existing model/property and only adds AN tables', () => {
  expect(baseline.schemaVersion).toBe(23);expect(configuration.schemaVersion).toBe(28);
  baseline.schema.forEach(model => {const expected=JSON.parse(JSON.stringify(model));if(model.name==='OpReceiptHeader')expected.properties.taxPolicyVersion='int?';expect(configuration.schema.find(row => row.name === model.name)).toEqual(expected);});
  expect(configuration.schema.filter(row => !baseline.schema.some(old => old.name === row.name)).map(row => row.name))
    .toEqual(['HolidayCalendar', 'AdviceRules', 'AdviceReceiptItem', 'AdviceReceiptHeader']);
  expect(Object.keys(configuration).sort()).toEqual(['schema', 'schemaVersion']);
  expect(configuration.deleteRealmIfMigrationNeeded).toBeUndefined();
  expect(configuration.inMemory).toBeUndefined();
  expect(configuration.path).toBe(baseline.path); // same default persisted path
});

test('schema 24->28 only makes AN tender optional and adds optional reminder; existing receipts and payloads have identical properties', () => {
  previous.schema.forEach(model => {
    const expected = JSON.parse(JSON.stringify(model));
    if(model.name==='OpReceiptHeader')expected.properties.taxPolicyVersion='int?';
    if (model.name === 'AdviceReceiptHeader') {expected.properties.amountReceived = 'double?';expected.properties.reminderNo = 'string?';}
    expect(configuration.schema.find(row => row.name === model.name)).toEqual(expected);
  });
  expect(configuration.schema).toHaveLength(previous.schema.length + 1);
});


import schema25 from '../test-support/fixtures/realm-schema-25.json';
test('schema25->28 adds only a nullable AN reminder and never rewrites saved payloads',()=>{
 expect(schema25.schemaVersion).toBe(25);expect(configuration.schemaVersion).toBe(28);
 schema25.schema.forEach(model=>{
  const expected=JSON.parse(JSON.stringify(model));
  if(model.name==='OpReceiptHeader')expected.properties.taxPolicyVersion='int?';
  if(model.name==='AdviceReceiptHeader')expected.properties.reminderNo='string?';
  expect(configuration.schema.find(row=>row.name===model.name)).toEqual(expected);
 });
 expect(configuration.schema).toHaveLength(schema25.schema.length + 1);
 expect(configuration.migration).toBeUndefined();
});

import schema26 from '../test-support/fixtures/realm-schema-26.json';
test('schema26->28 adds only nullable OP rendering metadata and never rewrites historical data',()=>{schema26.schema.forEach(model=>{const expected=JSON.parse(JSON.stringify(model));if(model.name==='OpReceiptHeader')expected.properties.taxPolicyVersion='int?';expect(configuration.schema.find(row=>row.name===model.name)).toEqual(expected);});expect(configuration.migration).toBeUndefined();});

import schema27 from '../test-support/fixtures/realm-schema-27.json';
test('schema27->28 adds only a calendar sync snapshot; saved receipt models remain identical',()=>{
 schema27.schema.forEach(model=>expect(configuration.schema.find(row=>row.name===model.name)).toEqual(model));
 expect(configuration.schema).toHaveLength(schema27.schema.length+1);
 expect(configuration.schema.find(row=>row.name==='HolidayCalendar')).toEqual({name:'HolidayCalendar',primaryKey:'id',properties:{id:'string',json:'string',loadedAt:'date',revision:'string?',serverGeneratedAt:'date?'}});
});

 test('v29 is additive: old item primary key and header item links untouched; no migration/purge callback',()=>{
 expect(currentConfiguration.schemaVersion).toBe(29);
 expect(currentConfiguration.migration).toBeUndefined();expect(currentConfiguration.deleteRealmIfMigrationNeeded).toBeUndefined();
 expect(currentConfiguration.schema.find(row=>row.name==='PaReceiptItem')).toEqual(configuration.schema.find(row=>row.name==='PaReceiptItem'));
 const header=currentConfiguration.schema.find(row=>row.name==='PaReceiptHeader');expect(header.properties.items).toEqual({type:'list',objectType:'PaReceiptItem'});expect(header.properties.lines).toEqual({type:'list',objectType:'PaReceiptLine'});expect(header.properties.status).toEqual({type:'string',default:'pending'});
 expect(currentConfiguration.schema.find(row=>row.name==='PaReceiptLine').primaryKey).toBe('id');
 });

import schema28 from '../test-support/fixtures/realm-schema-28.json';
test('exact prior v28 schema preserved, adding only new line model and PA archive properties',()=>{
 schema28.schema.forEach(old=>{const current=currentConfiguration.schema.find(row=>row.name===old.name);if(old.name!=='PaReceiptHeader')expect(current).toEqual(old);else{const properties={...current.properties};['lines','status','uploadedAt','uploadPayload'].forEach(key=>delete properties[key]);expect({...current,properties}).toEqual(old);}});
 expect(currentConfiguration.schema).toHaveLength(schema28.schema.length+1);
});


test('schema29->30 adds only nullable OP vehicle metadata, without rewriting receipts or deleting data',()=>{
 expect(latestConfiguration.schemaVersion).toBe(30);
 expect(currentConfiguration).toEqual(schema29);
 ['OpReceiptHeader','OpReceiptItem'].forEach(name=>expect(latestConfiguration.schema.find(row=>row.name===name).properties.carNo).toBe('string?'));
 expect(latestConfiguration.migration).toBeUndefined();
 expect(latestConfiguration.deleteRealmIfMigrationNeeded).toBeUndefined();
});

import schema30 from '../test-support/fixtures/realm-schema-30.json';
test('schema30->31 only adds durable transport outbox, preserving all financial records and no migration/purge callback',()=>{
 expect(v31Configuration.schemaVersion).toBe(31);
 schema30.schema.forEach(old=>expect(v31Configuration.schema.find(row=>row.name===old.name)).toEqual(old));
 expect(v31Configuration.schema).toHaveLength(schema30.schema.length+1);
 expect(v31Configuration.migration).toBeUndefined();expect(v31Configuration.deleteRealmIfMigrationNeeded).toBeUndefined();
 expect(v31Configuration.schema.find(row=>row.name==='LegacyPostingOutbox').properties.payload).toBe('string');
});

test('schema31->32 preserves every existing property and adds recoverable removal and upload-attempt models only',()=>{
 expect(finalConfiguration.schemaVersion).toBe(32);
 v31Configuration.schema.forEach(old=>expect(finalConfiguration.schema.find(row=>row.name===old.name)).toEqual(old));
 expect(finalConfiguration.schema).toHaveLength(v31Configuration.schema.length+2);
 expect(finalConfiguration.migration).toBeUndefined();expect(finalConfiguration.deleteRealmIfMigrationNeeded).toBeUndefined();
 expect(finalConfiguration.schema.find(row=>row.name==='ReceiptRemovalArchive').properties.payload).toBe('string');
});
