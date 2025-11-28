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

test('case-insensitive header keys', () => {
  const customHeaders = {
    AUTHORIZATION: 'project:environment.hash',
    'Content-Type': 'application/json',
  };

  const result = extractEnvironmentFromCustomHeaders(customHeaders);
  expect(result).toEqual('environment');
});

test('authorization header not present', () => {
  const result = extractEnvironmentFromCustomHeaders({});
  expect(result).toBeUndefined();
});

test('environment part is empty', () => {
  const customHeaders = {
    Authorization: 'project:.hash',
  };

  const result = extractEnvironmentFromCustomHeaders(customHeaders);
  expect(result).toBeUndefined();
});
