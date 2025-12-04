import type { Options as KyOptions } from 'ky';
import type { Dispatcher } from 'undici';

type KyRetryOptions = NonNullable<KyOptions['retry']>;

export const defaultRetry: KyRetryOptions = {
  limit: 2,
  statusCodes: [408, 429, 500, 502, 503, 504],
};

const createKyClient = async () => {
  const { default: ky } = await import('ky');
  const fetchWithDispatcher: typeof fetch = (input, init) => {
    const { agent, ...rest } = (init ?? {}) as { agent?: Dispatcher | ((url: URL) => unknown) };

    const resolveDispatcher = (): Dispatcher | undefined => {
      if (!agent) return undefined;
      if (typeof agent === 'function') {
        const url =
          typeof input === 'string' || input instanceof URL ? new URL(input) : new URL(input.url);
        return agent(url) as unknown as Dispatcher;
      }
      return agent as Dispatcher;
    };

    const dispatcher = resolveDispatcher();
    return dispatcher
      ? fetch(input, { ...(rest as RequestInit), dispatcher } as any)
      : fetch(input, rest as RequestInit);
  };
  return ky.create({
    throwHttpErrors: true,
    retry: defaultRetry,
    fetch: fetchWithDispatcher,
  });
};

let kyClientPromise: ReturnType<typeof createKyClient> | undefined;

export const getKyClient = async () => {
  if (!kyClientPromise) {
    kyClientPromise = createKyClient();
  }

  return kyClientPromise;
};
