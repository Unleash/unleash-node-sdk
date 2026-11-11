import { expect, test } from 'vitest';
import { strategyEvaluator } from './evaluation';

test('RemoteAddressStrategy should not crash for missing params', async () => {
  const evaluate = await strategyEvaluator('remoteAddress');
  const params = {};
  const context = { remoteAddress: '123' };
  expect(await evaluate(params, context)).toBe(false);
});

test('RemoteAddressStrategy should be enabled for ip in list (localhost)', async () => {
  const evaluate = await strategyEvaluator('remoteAddress');
  const params = { IPs: '127.0.0.1' };
  const context = { remoteAddress: '127.0.0.1' };
  expect(await evaluate(params, context)).toBe(true);
});

test('RemoteAddressStrategy should not be enabled for ip NOT in list', async () => {
  const evaluate = await strategyEvaluator('remoteAddress');
  const params = { IPs: '127.0.1.1, 127.0.1.2, 127.0.1.3' };
  const context = { remoteAddress: '127.0.1.5' };
  expect(await evaluate(params, context)).toBe(false);
});

test('RemoteAddressStrategy should be enabled for ip in list', async () => {
  const evaluate = await strategyEvaluator('remoteAddress');
  const params = { IPs: '127.0.1.1, 127.0.1.2,127.0.1.3' };
  const context = { remoteAddress: '127.0.1.2' };
  expect(await evaluate(params, context)).toBe(true);
});

test('RemoteAddressStrategy should be enabled for ip inside range in a list', async () => {
  const evaluate = await strategyEvaluator('remoteAddress');
  const params = { IPs: '127.0.1.1, 127.0.1.2,127.0.1.3, 160.33.0.0/16' };
  const context = { remoteAddress: '160.33.0.33' };
  expect(await evaluate(params, context)).toBe(true);
});

test('RemoteAddressStrategy should handle invalid IPs', async () => {
  const evaluate = await strategyEvaluator('remoteAddress');
  const params = { IPs: '127.invalid' };
  const context = { remoteAddress: '127.0.0.1' };
  expect(await evaluate(params, context)).toBe(false);
});

test('RemoteAddressStrategy should ignore invalid IPs', async () => {
  const evaluate = await strategyEvaluator('remoteAddress');
  const params = { IPs: '127.0.0.2, 127.invalid, 127.0.0.1' };
  const context = { remoteAddress: '127.0.0.1' };
  expect(await evaluate(params, context)).toBe(true);
});
