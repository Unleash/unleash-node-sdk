import { expect, test } from 'vitest';
import { supportedClientSpecVersion } from '../client-spec-version';
import { buildHeaders } from '../request';

test('Correct headers should be included', () => {
  const headers = buildHeaders({
    appName: 'myApp',
    instanceId: 'instanceId',
    etag: undefined,
    contentType: undefined,
    connectionId: 'connectionId',
    interval: 10000,
    headers: {
      hello: 'world',
    },
  });
  expect(headers.hello).toEqual('world');
  expect(headers['UNLEASH-INSTANCEID']).toEqual('instanceId');
  expect(headers['unleash-connection-id']).toEqual('connectionId');
  expect(headers['unleash-interval']).toEqual('10000');
  expect(headers['unleash-appname']).toEqual('myApp');
  expect(headers['unleash-sdk']).toMatch(/^unleash-node-sdk:\d+\.\d+\.\d+/);
});

test('Includes client spec header when version is available', () => {
  const headers = buildHeaders({
    appName: 'myApp',
    instanceId: 'instanceId',
    etag: undefined,
    contentType: undefined,
    headers: undefined,
    connectionId: 'connectionId',
    interval: 10000,
  });

  expect(headers['Unleash-Client-Spec']).toEqual(supportedClientSpecVersion);
});
