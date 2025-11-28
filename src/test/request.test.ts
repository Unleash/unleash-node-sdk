import http from 'node:http';
import https from 'node:https';
import { expect, test } from 'vitest';
import { buildHeaders, getDefaultAgent } from '../request';

test('http URLs should yield http.Agent', (t) => {
  const agent = getDefaultAgent(new URL('http://unleash-host1.com'));
  expect(agent).toBeInstanceOf(http.Agent);
});

test('https URLs should yield https.Agent', (t) => {
  const agent = getDefaultAgent(new URL('https://unleash.hosted.com'));
  expect(agent).toBeInstanceOf(https.Agent);
});

test('Correct headers should be included', (t) => {
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
