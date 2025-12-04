import type { Options as KyOptions } from 'ky';

type KyRetryOptions = NonNullable<KyOptions['retry']>;

export const defaultRetry: KyRetryOptions = {
  limit: 2,
  statusCodes: [408, 429, 500, 502, 503, 504],
};

const createKyClient = async () => {
  const { default: ky } = await import('ky');
  return ky.create({
    throwHttpErrors: true,
    retry: defaultRetry,
  });
};

let kyClientPromise: ReturnType<typeof createKyClient> | undefined;

export const getKyClient = async () => {
  if (!kyClientPromise) {
    kyClientPromise = createKyClient();
  }

  return kyClientPromise;
};
