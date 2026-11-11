import { hostname } from 'node:os';
import { afterEach, expect, test, vi } from 'vitest';
import { strategyEvaluator } from './evaluation';

afterEach(() => vi.unstubAllEnvs());

test('strategy should be disabled when no hostname defined', async () => {
  const evaluate = await strategyEvaluator('applicationHostname');
  const context = { hostNames: '' };
  expect(await evaluate(context)).toBe(false);
});

test('strategy should be enabled when hostname is defined', async () => {
  vi.stubEnv('HOSTNAME', '');
  const evaluate = await strategyEvaluator('applicationHostname');
  const context = { hostNames: hostname() };
  expect(await evaluate(context)).toBe(true);
});

test('strategy should be enabled when hostname is defined in list', async () => {
  vi.stubEnv('HOSTNAME', '');
  const evaluate = await strategyEvaluator('applicationHostname');
  const context = { hostNames: `localhost, ${hostname()}` };
  expect(await evaluate(context)).toBe(true);
});

test('strategy should be enabled when hostname is defined via env', async () => {
  vi.stubEnv('HOSTNAME', 'some-random-name');
  const evaluate = await strategyEvaluator('applicationHostname');
  const context = { hostNames: 'localhost, some-random-name' };
  expect(await evaluate(context)).toBe(true);
});

test('strategy should handle wierd casing', async () => {
  vi.stubEnv('HOSTNAME', 'some-random-NAME');
  const evaluate = await strategyEvaluator('applicationHostname');
  const context = { hostNames: 'localhost, some-random-name' };
  expect(await evaluate(context)).toBe(true);
});
