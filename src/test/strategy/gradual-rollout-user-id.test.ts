import { expect, test } from 'vitest';
import { strategyEvaluator } from './evaluation';

test('should be enabled when percentage is 100', async () => {
  const evaluate = await strategyEvaluator('gradualRolloutUserId');
  const params = { percentage: '100', groupId: 'gr1' };
  const context = { userId: '123' };
  expect(await evaluate(params, context)).toBe(true);
});

test('should be disabled when percentage is 0', async () => {
  const evaluate = await strategyEvaluator('gradualRolloutUserId');
  const params = { percentage: '0', groupId: 'gr1' };
  const context = { userId: '123' };
  expect(await evaluate(params, context)).toBe(false);
});

test('should be enabled when percentage is exactly same', async () => {
  const evaluate = await strategyEvaluator('gradualRolloutUserId');
  const userId = '123123';
  const groupId = 'group1';

  const percentage = 33;
  const params = { percentage: `${percentage}`, groupId };
  const context = { userId };
  expect(await evaluate(params, context)).toBe(true);
});

test('should be disabled when percentage is just below required value', async () => {
  const evaluate = await strategyEvaluator('gradualRolloutUserId');
  const userId = '123123';
  const groupId = 'group1';

  const percentage = 33 - 1;
  const params = { percentage: `${percentage}`, groupId };
  const context = { userId };
  expect(await evaluate(params, context)).toBe(false);
});

test('should only at most miss by one percent', async () => {
  const evaluate = await strategyEvaluator('gradualRolloutUserId');

  const percentage = 10;
  const groupId = 'groupId';

  const rounds = 200000;
  let enabledCount = 0;

  for (let i = 0; i < rounds; i++) {
    const params = { percentage: String(percentage), groupId };
    const context = { userId: String(i) };
    if (await evaluate(params, context)) {
      enabledCount++;
    }
  }
  const actualPercentage = Math.round((enabledCount / rounds) * 100);
  const highMark = percentage + 1;
  const lowMark = percentage - 1;

  expect(lowMark <= actualPercentage).toBe(true);
  expect(highMark >= actualPercentage).toBe(true);
});
