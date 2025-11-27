import { test } from 'vitest';

import { getAppliedJitter } from '../helpers';

test('jitter should be within bounds', (t) => {
  const jitter = getAppliedJitter(10000);
  t.true(jitter <= 10000 && jitter >= -10000);
});
