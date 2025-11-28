import { hostname } from 'node:os';
import { expect, test } from 'vitest';

import ApplicationHostnameStrategy from '../../strategy/application-hostname-strategy';

test('strategy should have correct name', (t) => {
  const strategy = new ApplicationHostnameStrategy();
  expect(strategy.name).toBe('applicationHostname');
});

test('strategy should be disabled when no hostname defined', (t) => {
  const strategy = new ApplicationHostnameStrategy();
  const context = { hostNames: '' };
  expect(strategy.isEnabled(context)).toBe(false);
});

test('strategy should be enabled when hostname is defined', (t) => {
  process.env.HOSTNAME = '';
  const strategy = new ApplicationHostnameStrategy();
  const context = { hostNames: hostname() };
  expect(strategy.isEnabled(context)).toBe(true);
});

test('strategy should be enabled when hostname is defined in list', (t) => {
  process.env.HOSTNAME = '';
  const strategy = new ApplicationHostnameStrategy();
  const context = { hostNames: `localhost, ${hostname()}` };
  expect(strategy.isEnabled(context)).toBe(true);
});

test('strategy should be enabled when hostname is defined via env', (t) => {
  process.env.HOSTNAME = 'some-random-name';
  const strategy = new ApplicationHostnameStrategy();
  const context = { hostNames: 'localhost, some-random-name' };
  expect(strategy.isEnabled(context)).toBe(true);
});

test('strategy should handle wierd casing', (t) => {
  process.env.HOSTNAME = 'some-random-NAME';
  const strategy = new ApplicationHostnameStrategy();
  const context = { hostNames: 'localhost, some-random-name' };
  expect(strategy.isEnabled(context)).toBe(true);
});
