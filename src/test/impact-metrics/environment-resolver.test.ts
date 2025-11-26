import test from '../ava-shim';
import { extractEnvironmentFromCustomHeaders } from '../../impact-metrics/environment-resolver';

test('valid headers', (t) => {
  const customHeaders = {
    Authorization: 'project:environment.hash',
    'Content-Type': 'application/json',
  };

  const result = extractEnvironmentFromCustomHeaders(customHeaders);
  t.is(result, 'environment');
});

test('case-insensitive header keys', (t) => {
  const customHeaders = {
    AUTHORIZATION: 'project:environment.hash',
    'Content-Type': 'application/json',
  };

  const result = extractEnvironmentFromCustomHeaders(customHeaders);
  t.is(result, 'environment');
});

test('authorization header not present', (t) => {
  const result = extractEnvironmentFromCustomHeaders({});
  t.is(result, undefined);
});

test('environment part is empty', (t) => {
  const customHeaders = {
    Authorization: 'project:.hash',
  };

  const result = extractEnvironmentFromCustomHeaders(customHeaders);
  t.is(result, undefined);
});
