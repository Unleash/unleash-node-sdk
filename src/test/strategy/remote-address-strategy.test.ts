import { expect, test } from 'vitest';

import RemoteAddressStrategy from '../../strategy/remote-addresss-strategy';

test('strategy should have correct name', () => {
  const strategy = new RemoteAddressStrategy();
  expect(strategy.name).toBe('remoteAddress');
});

test('RemoteAddressStrategy should not crash for missing params', () => {
  const strategy = new RemoteAddressStrategy();
  const params = {};
  const context = { remoteAddress: '123' };
  expect(strategy.isEnabled(params, context)).toBe(false);
});

test('RemoteAddressStrategy should be enabled for ip in list (localhost)', () => {
  const strategy = new RemoteAddressStrategy();
  const params = { IPs: '127.0.0.1' };
  const context = { remoteAddress: '127.0.0.1' };
  expect(strategy.isEnabled(params, context)).toBe(true);
});

test('RemoteAddressStrategy should not be enabled for ip NOT in list', () => {
  const strategy = new RemoteAddressStrategy();
  const params = { IPs: '127.0.1.1, 127.0.1.2, 127.0.1.3' };
  const context = { remoteAddress: '127.0.1.5' };
  expect(strategy.isEnabled(params, context)).toBe(false);
});

test('RemoteAddressStrategy should be enabled for ip in list', () => {
  const strategy = new RemoteAddressStrategy();
  const params = { IPs: '127.0.1.1, 127.0.1.2,127.0.1.3' };
  const context = { remoteAddress: '127.0.1.2' };
  expect(strategy.isEnabled(params, context)).toBe(true);
});

test('RemoteAddressStrategy should be enabled for ip inside range in a list', () => {
  const strategy = new RemoteAddressStrategy();
  const params = { IPs: '127.0.1.1, 127.0.1.2,127.0.1.3, 160.33.0.0/16' };
  const context = { remoteAddress: '160.33.0.33' };
  expect(strategy.isEnabled(params, context)).toBe(true);
});

test('RemoteAddressStrategy should handle invalid IPs', () => {
  const strategy = new RemoteAddressStrategy();
  const params = { IPs: '127.invalid' };
  const context = { remoteAddress: '127.0.0.1' };
  expect(strategy.isEnabled(params, context)).toBe(false);
});

test('RemoteAddressStrategy should ignore invalid IPs', () => {
  const strategy = new RemoteAddressStrategy();
  const params = { IPs: '127.0.0.2, 127.invalid, 127.0.0.1' };
  const context = { remoteAddress: '127.0.0.1' };
  expect(strategy.isEnabled(params, context)).toBe(true);
});
