import { expect, test } from 'vitest';
import { extractEnvironmentFromCustomHeaders } from '../../impact-metrics/environment-resolver';

test('valid headers', () => {
  const customHeaders = {
    Authorization: 'project:environment.hash',
    'Content-Type': 'application/json',
  };

  const result = extractEnvironmentFromCustomHeaders(customHeaders);
  expect(result).toEqual('environment');
});

test('case-insensitive header keys', (t) => {
  const customHeaders = {
    AUTHORIZATION: 'project:environment.hash',
    'Content-Type': 'application/json',
  };

  const result = extractEnvironmentFromCustomHeaders(customHeaders);
  expect(result).toEqual('environment');
});

test('authorization header not present', (t) => {
  const result = extractEnvironmentFromCustomHeaders({});
  expect(result).toBeUndefined();
});

test('environment part is empty', (t) => {
  const customHeaders = {
    Authorization: 'project:.hash',
  };

  const result = extractEnvironmentFromCustomHeaders(customHeaders);
  expect(result).toBeUndefined();
});
