import { expect, test } from 'vitest';
import { strategyEvaluator } from './evaluation';

test('user-with-id-strategy should be enabled for userId', async () => {
  const evaluate = await strategyEvaluator('userWithId');
  const params = { userIds: '123' };
  const context = { userId: '123' };
  expect(await evaluate(params, context)).toBe(true);
});

test('user-with-id-strategy should be enabled for userId in list (spaced commas)', async () => {
  const evaluate = await strategyEvaluator('userWithId');
  const params = { userIds: '123, 122, 12312312' };
  const context = { userId: '12312312' };
  expect(await evaluate(params, context)).toBe(true);
});

test('user-with-id-strategy should not be enabled for userId NOT in list', async () => {
  const evaluate = await strategyEvaluator('userWithId');
  const params = { userIds: '123, 122, 122' };
  const context = { userId: '12' };
  expect(await evaluate(params, context)).toBe(false);
});

test('user-with-id-strategy should be enabled for userId in list', async () => {
  const evaluate = await strategyEvaluator('userWithId');
  const params = { userIds: '123,122,12312312' };
  const context = { userId: '122' };
  expect(await evaluate(params, context)).toBe(true);
});

test('user-with-id strategy should be disabled without parameters', async () => {
  const evaluate = await strategyEvaluator('userWithId');
  expect(await evaluate({}, {})).toBe(false);
});
