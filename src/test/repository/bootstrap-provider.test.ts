import nock from 'nock';
import { afterEach, expect, test } from 'vitest';
import {
  DefaultBootstrapProvider,
  resolveBootstrapProvider,
} from '../../repository/bootstrap-provider';
import { state } from '../fixtures';

afterEach(() => nock.cleanAll());

test('inline feature responses take precedence over a bootstrap URL', async () => {
  const data = state();
  const request = nock('http://bootstrap.test').get('/snapshot').reply(200, state([]));
  const provider = new DefaultBootstrapProvider(
    { features: data, url: 'http://bootstrap.test/snapshot' },
    'app',
    'instance',
  );
  expect(await provider.readBootstrap()).toEqual(data);
  expect(request.isDone()).toBe(false);
});

test('bootstrap URL requests use configured headers and SDK identity', async () => {
  const request = nock('http://bootstrap.test')
    .get('/snapshot')
    .matchHeader('authorization', 'bootstrap-token')
    .matchHeader('unleash-appname', 'app')
    .matchHeader('unleash-instanceid', 'instance')
    .reply(200, state());
  const provider = new DefaultBootstrapProvider(
    { url: 'http://bootstrap.test/snapshot', urlHeaders: { Authorization: 'bootstrap-token' } },
    'app',
    'instance',
  );
  expect(await provider.readBootstrap()).toEqual(state());
  expect(request.isDone()).toBe(true);
});

test('an unavailable bootstrap URL yields no local state', async () => {
  nock('http://bootstrap.test').get('/snapshot').reply(404);
  const provider = new DefaultBootstrapProvider(
    { url: 'http://bootstrap.test/snapshot' },
    'app',
    'instance',
  );
  expect(await provider.readBootstrap()).toBeUndefined();
});

test('an explicitly supplied bootstrap provider is used unchanged', async () => {
  const provider = { readBootstrap: async () => state() };
  expect(
    resolveBootstrapProvider(
      { features: state([]), bootstrapProvider: provider },
      'app',
      'instance',
    ),
  ).toBe(provider);
});
