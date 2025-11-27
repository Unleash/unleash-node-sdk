import test from '../test-shim';
import { hostname } from 'os';

import ApplicationHostnameStrategy from '../../strategy/application-hostname-strategy';

test('strategy should have correct name', (t) => {
  const strategy = new ApplicationHostnameStrategy();
  t.deepEqual(strategy.name, 'applicationHostname');
});

test('strategy should be disabled when no hostname defined', (t) => {
  const strategy = new ApplicationHostnameStrategy();
  const context = { hostNames: '' };
  t.false(strategy.isEnabled(context));
});

test('strategy should be enabled when hostname is defined', (t) => {
  process.env.HOSTNAME = '';
  const strategy = new ApplicationHostnameStrategy();
  const context = { hostNames: hostname() };
  t.true(strategy.isEnabled(context));
});

test('strategy should be enabled when hostname is defined in list', (t) => {
  process.env.HOSTNAME = '';
  const strategy = new ApplicationHostnameStrategy();
  const context = { hostNames: `localhost, ${hostname()}` };
  t.true(strategy.isEnabled(context));
});

test('strategy should be enabled when hostname is defined via env', (t) => {
  process.env.HOSTNAME = 'some-random-name';
  const strategy = new ApplicationHostnameStrategy();
  const context = { hostNames: 'localhost, some-random-name' };
  t.true(strategy.isEnabled(context));
});

test('strategy should handle wierd casing', (t) => {
  process.env.HOSTNAME = 'some-random-NAME';
  const strategy = new ApplicationHostnameStrategy();
  const context = { hostNames: 'localhost, some-random-name' };
  t.true(strategy.isEnabled(context));
});
