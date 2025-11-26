import test from '../ava-shim';

import RemoteAddressStrategy from '../../strategy/remote-addresss-strategy';

test('strategy should have correct name', (t) => {
  const strategy = new RemoteAddressStrategy();
  t.deepEqual(strategy.name, 'remoteAddress');
});

test('RemoteAddressStrategy should not crash for missing params', (t) => {
  const strategy = new RemoteAddressStrategy();
  const params = {};
  const context = { remoteAddress: '123' };
  t.false(strategy.isEnabled(params, context));
});

test('RemoteAddressStrategy should be enabled for ip in list (localhost)', (t) => {
  const strategy = new RemoteAddressStrategy();
  const params = { IPs: '127.0.0.1' };
  const context = { remoteAddress: '127.0.0.1' };
  t.true(strategy.isEnabled(params, context));
});

test('RemoteAddressStrategy should not be enabled for ip NOT in list', (t) => {
  const strategy = new RemoteAddressStrategy();
  const params = { IPs: '127.0.1.1, 127.0.1.2, 127.0.1.3' };
  const context = { remoteAddress: '127.0.1.5' };
  t.false(strategy.isEnabled(params, context));
});

test('RemoteAddressStrategy should be enabled for ip in list', (t) => {
  const strategy = new RemoteAddressStrategy();
  const params = { IPs: '127.0.1.1, 127.0.1.2,127.0.1.3' };
  const context = { remoteAddress: '127.0.1.2' };
  t.true(strategy.isEnabled(params, context));
});

test('RemoteAddressStrategy should be enabled for ip inside range in a list', (t) => {
  const strategy = new RemoteAddressStrategy();
  const params = { IPs: '127.0.1.1, 127.0.1.2,127.0.1.3, 160.33.0.0/16' };
  const context = { remoteAddress: '160.33.0.33' };
  t.true(strategy.isEnabled(params, context));
});

test('RemoteAddressStrategy should handle invalid IPs', (t) => {
  const strategy = new RemoteAddressStrategy();
  const params = { IPs: '127.invalid' };
  const context = { remoteAddress: '127.0.0.1' };
  t.false(strategy.isEnabled(params, context));
});

test('RemoteAddressStrategy should ignore invalid IPs', (t) => {
  const strategy = new RemoteAddressStrategy();
  const params = { IPs: '127.0.0.2, 127.invalid, 127.0.0.1' };
  const context = { remoteAddress: '127.0.0.1' };
  t.true(strategy.isEnabled(params, context));
});
