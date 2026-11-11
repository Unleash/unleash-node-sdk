import { expect, test } from 'vitest';
import { strategyEvaluator } from './evaluation';

test('default strategy should be enabled', async () => {
  const evaluate = await strategyEvaluator('default');
  expect(await evaluate()).toBe(true);
});
