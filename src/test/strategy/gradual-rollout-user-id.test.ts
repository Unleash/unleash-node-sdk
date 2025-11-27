import test from '../test-shim';

import GradualRolloutUserIdStrategy from '../../strategy/gradual-rollout-user-id';
import { normalizedStrategyValue } from '../../strategy/util';

test('gradual-rollout-user-id strategy should have correct name', (t) => {
  const strategy = new GradualRolloutUserIdStrategy();
  t.deepEqual(strategy.name, 'gradualRolloutUserId');
});

test('should be enabled when percentage is 100', (t) => {
  const strategy = new GradualRolloutUserIdStrategy();
  const params = { percentage: '100', groupId: 'gr1' };
  const context = { userId: '123' };
  t.true(strategy.isEnabled(params, context));
});

test('should be disabled when percentage is 0', (t) => {
  const strategy = new GradualRolloutUserIdStrategy();
  const params = { percentage: '0', groupId: 'gr1' };
  const context = { userId: '123' };
  t.false(strategy.isEnabled(params, context));
});

test('should be enabled when percentage is exactly same', (t) => {
  const strategy = new GradualRolloutUserIdStrategy();
  const userId = '123123';
  const groupId = 'group1';

  const percentage = normalizedStrategyValue(userId, groupId);
  const params = { percentage: `${percentage}`, groupId };
  const context = { userId };
  t.true(strategy.isEnabled(params, context));
});

test('should be disabled when percentage is just below required value', (t) => {
  const strategy = new GradualRolloutUserIdStrategy();
  const userId = '123123';
  const groupId = 'group1';

  const percentage = normalizedStrategyValue(userId, groupId) - 1;
  const params = { percentage: `${percentage}`, groupId };
  const context = { userId };
  t.false(strategy.isEnabled(params, context));
});

test('should only at most miss by one percent', (t) => {
  const strategy = new GradualRolloutUserIdStrategy();

  const percentage = 10;
  const groupId = 'groupId';

  const rounds = 200000;
  let enabledCount = 0;

  for (let i = 0; i < rounds; i++) {
    const params = { percentage, groupId };
    const context = { userId: i };
    // @ts-expect-error
    if (strategy.isEnabled(params, context)) {
      enabledCount++;
    }
  }
  const actualPercentage = Math.round((enabledCount / rounds) * 100);
  const highMark = percentage + 1;
  const lowMark = percentage - 1;

  t.true(lowMark <= actualPercentage);
  t.true(highMark >= actualPercentage);
});
