import axios from 'axios';
import LoadAdviceRules from '../src/components/load-data/LoadAdviceRules';
import {memoryRealm, CONFIG} from '../test-support/memoryRealm';
import {readAdviceRules} from '../src/advice/rules';

let mockDatabase;
jest.mock('../src/realm', () => ({
  write: callback => mockDatabase.write(callback),
  create: (...args) => mockDatabase.create(...args),
}));
jest.mock('../src/global', () => ({SERVER_URL: 'https://fixture.invalid'}));
jest.mock('axios', () => ({get: jest.fn()}));
beforeEach(() => {mockDatabase = memoryRealm();axios.get.mockReset();});

test('office rules use the agreed endpoint and persist explicit settings', async () => {
  mockDatabase.tables.AdviceRules = [];
  axios.get.mockResolvedValue({data: CONFIG});
  expect(await LoadAdviceRules()).toBe(true);
  expect(axios.get).toHaveBeenCalledWith('https://fixture.invalid/api/load-data/advice-rules');
  expect(readAdviceRules(mockDatabase).rules).toEqual(CONFIG.rules);
});

test('absent endpoint preserves cached rules for offline use and cannot invent first-load rules', async () => {
  const before = mockDatabase.tables.AdviceRules[0].json;
  axios.get.mockRejectedValue(new Error('404 endpoint absent'));
  expect(await LoadAdviceRules()).toBe(false);
  expect(mockDatabase.tables.AdviceRules[0].json).toBe(before);
  mockDatabase.tables.AdviceRules = [];
  expect(await LoadAdviceRules()).toBe(false);
  expect(() => readAdviceRules(mockDatabase)).toThrow();
});

test('explicit unconfigured or invalid server policy disables previously configured collection', async () => {
  for (const data of [{protocolVersion: 1, configured: false}, {...CONFIG, rules: {...CONFIG.rules, overdueFee: null}}]) {
    axios.get.mockResolvedValue({data});
    expect(await LoadAdviceRules()).toBe(false);
    expect(() => readAdviceRules(mockDatabase)).toThrow();
  }
});


test.each(['<!DOCTYPE html><html>office SPA</html>', '', null, []])('malformed non-policy response %j never overwrites a successful offline cache', async data => {
  const before = JSON.stringify(mockDatabase.tables.AdviceRules);
  axios.get.mockResolvedValue({data});
  expect(await LoadAdviceRules()).toBe(false);
  expect(JSON.stringify(mockDatabase.tables.AdviceRules)).toBe(before);
  expect(readAdviceRules(mockDatabase).rules).toEqual(CONFIG.rules);
  mockDatabase.tables.AdviceRules = [];
  expect(await LoadAdviceRules()).toBe(false);
  expect(mockDatabase.tables.AdviceRules).toHaveLength(0);
  expect(() => readAdviceRules(mockDatabase)).toThrow();
});
