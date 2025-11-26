import test from '../ava-shim';

import GradualRolloutRandomStrategy from '../../strategy/gradual-rollout-random';

test('should have correct name', (t) => {
  const strategy = new GradualRolloutRandomStrategy();
  t.deepEqual(strategy.name, 'gradualRolloutRandom');
});

test('should only at most miss by one percent', (t) => {
  const strategy = new GradualRolloutRandomStrategy();

  const percentage = 25;
  const groupId = 'groupId';

  const rounds = 200000;
  let enabledCount = 0;

  for (let i = 0; i < rounds; i++) {
    const params = { percentage, groupId };
    const context = { sessionId: i };
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

test('should be disabled when percentage is lower than random', (t) => {
  const strategy = new GradualRolloutRandomStrategy(() => 50);
  const params = { percentage: '20', groupId: 'test' };
  // @ts-expect-error
  t.false(strategy.isEnabled(params));
});

test('should be disabled when percentage=0', (t) => {
  const strategy = new GradualRolloutRandomStrategy(() => 1);
  const params = { percentage: '0', groupId: 'test' };
  // @ts-expect-error
  t.false(strategy.isEnabled(params));
});

test('should be disabled when percentage=0 and random is not zero', (t) => {
  const strategy = new GradualRolloutRandomStrategy(() => 50);
  const params = { percentage: '0', groupId: 'test' };
  // @ts-expect-error
  t.false(strategy.isEnabled(params));
});

test('should be enabled when percentage is greater than random', (t) => {
  const strategy = new GradualRolloutRandomStrategy(() => 10);
  const params = { percentage: '20', groupId: 'test' };
  // @ts-expect-error
  t.true(strategy.isEnabled(params));
});

test('should be enabled when percentage=100', (t) => {
  const strategy = new GradualRolloutRandomStrategy(() => 90);
  const params = { percentage: '100', groupId: 'test' };
  // @ts-expect-error
  t.true(strategy.isEnabled(params));
});

test('should be enabled when percentage and random are the same', (t) => {
  const strategy = new GradualRolloutRandomStrategy(() => 55);
  const params = { percentage: '55', groupId: 'test' };
  // @ts-expect-error
  t.true(strategy.isEnabled(params));
});
