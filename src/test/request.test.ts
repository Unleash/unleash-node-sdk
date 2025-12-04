import { Agent as UndiciAgent } from 'undici';
import { expect, test } from 'vitest';
import { buildHeaders, getDefaultAgent } from '../request';

test('http URLs should yield undici Agent', () => {
  const agent = getDefaultAgent(new URL('http://unleash-host1.com'));
  expect(agent).toBeInstanceOf(UndiciAgent);
});

test('https URLs should yield undici Agent', () => {
  const agent = getDefaultAgent(new URL('https://unleash.hosted.com'));
  expect(agent).toBeInstanceOf(UndiciAgent);
});

test('Correct headers should be included', () => {
  const headers = buildHeaders({
    appName: 'myApp',
    instanceId: 'instanceId',
    etag: undefined,
    contentType: undefined,
    connectionId: 'connectionId',
    interval: 10000,
    custom: {
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
