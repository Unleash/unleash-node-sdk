import test from 'ava';
import RedisStorageProvider from '../../repository/storage-provider-redis';

class FakeRedisClient {
  isOpen = false;

  quitCalls = 0;

  private readonly store = new Map<string, string>();

  async connect(): Promise<void> {
    this.isOpen = true;
  }

  async set(key: string, value: string): Promise<void> {
    this.store.set(key, value);
  }

  async get(key: string): Promise<string | null> {
    return this.store.has(key) ? this.store.get(key)! : null;
  }

  async quit(): Promise<void> {
    this.quitCalls += 1;
    this.isOpen = false;
  }

  setRaw(key: string, value: string): void {
    this.store.set(key, value);
  }
}

test('redis storage stores and retrieves values', async (t) => {
  const fakeClient = new FakeRedisClient();
  const storageProvider = new RedisStorageProvider<{ features: any[] }>({
    client: fakeClient as unknown as any,
  });

  await storageProvider.set('my-app', { features: [{ name: 'feature' }] });
  const result = await storageProvider.get('my-app');

  t.deepEqual(result, { features: [{ name: 'feature' }] });
  t.true(fakeClient.isOpen);
});

test('redis storage returns undefined when no value is stored', async (t) => {
  const fakeClient = new FakeRedisClient();
  const storageProvider = new RedisStorageProvider({
    client: fakeClient as unknown as any,
  });

  const result = await storageProvider.get('unknown');

  t.is(result, undefined);
});

test('redis storage surfaces parse errors with context', async (t) => {
  const fakeClient = new FakeRedisClient();
  const storageProvider = new RedisStorageProvider({
    client: fakeClient as unknown as any,
  });

  fakeClient.setRaw('unleash:backup:app_test', '{broken');

  const error = await t.throwsAsync(async () => storageProvider.get('app/test'));

  t.truthy(error);
  t.regex(error!.message, /unleash:backup:app_test/);
});

test('destroy does not quit external redis client', async (t) => {
  const fakeClient = new FakeRedisClient();
  const storageProvider = new RedisStorageProvider({
    client: fakeClient as unknown as any,
  });

  await storageProvider.destroy();

  t.is(fakeClient.quitCalls, 0);
});
