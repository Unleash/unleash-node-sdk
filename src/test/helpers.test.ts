import { expect, test } from 'vitest';

import { getAppliedJitter } from '../helpers';

test('jitter should be within bounds', () => {
  const jitter = getAppliedJitter(10000);
  expect(jitter).toBeLessThanOrEqual(10000);
  expect(jitter).toBeGreaterThanOrEqual(-10000);
});
