import { URL } from 'node:url';
import type { RetryOptions } from 'ky';
import ky from 'ky';
import { getProxyForUrl } from 'proxy-from-env';
import { type Dispatcher, ProxyAgent, Agent as UndiciAgent } from 'undici';
import { supportedClientSpecVersion } from './client-spec-version';
import details from './details.json';
import type { CustomHeaders } from './headers';
import type { HttpOptions } from './http-options';

export const defaultRetry: RetryOptions = {
  limit: 2,
  statusCodes: [408, 429, 500, 502, 503, 504],
};

const getDefaultAgent = (url: URL, rejectUnauthorized?: boolean): Dispatcher => {
  const proxy = getProxyForUrl(url.href);
  const connect = rejectUnauthorized === undefined ? undefined : { rejectUnauthorized };

  if (!proxy || proxy === '') {
    return new UndiciAgent({ connect });
  }

  return new ProxyAgent({ uri: proxy, connect });
};

const createFetchWithDispatcher =
  (httpOptions?: HttpOptions): typeof fetch =>
  (input: string | URL | globalThis.Request, init?: RequestInit) => {
    const resolveDispatcher =
      httpOptions?.agent ||
      ((targetUrl: URL) => getDefaultAgent(targetUrl, httpOptions?.rejectUnauthorized));

    const getUrl = (): URL =>
      typeof input === 'string' || input instanceof URL ? new URL(input) : new URL(input.url);

    const dispatcher = resolveDispatcher(getUrl()) as Dispatcher;

    return fetch(input, {
      ...(init ?? {}),
      // @ts-expect-error - dispatcher is not part of RequestInit, but undici accepts it.
      dispatcher,
    });
  };

const getKyClient = async ({ timeout, httpOptions }: HttpClientConfig) => {
  const retryOverrides: Partial<RetryOptions> = {
    limit: httpOptions?.maxRetries,
  };
  return ky.create({
    throwHttpErrors: true,
    retry: { ...defaultRetry, ...retryOverrides },
    timeout: timeout ?? 10_000,
    fetch: createFetchWithDispatcher(httpOptions),
  });
};
export interface SDKData {
  appName: string;
  instanceId: string;
  connectionId: string;
}

interface HeaderOptions extends SDKData {
  etag?: string;
  contentType?: string;
  headers?: CustomHeaders;
  interval?: number;
}

export interface RequestOptions {
  url: string;
  timeout?: number;
  interval?: number;
  headers?: CustomHeaders;
  httpOptions?: HttpOptions;
}

export interface GetRequestOptions extends RequestOptions {
  etag?: string;
}

export interface Data {
  [key: string]: unknown;
}

export interface PostRequestOptions extends RequestOptions {
  json: Data;
}

export const buildHeaders = ({
  appName,
  instanceId,
  etag,
  contentType,
  headers,
  connectionId,
  interval,
}: HeaderOptions): Record<string, string> => {
  const head: Record<string, string> = {};
  if (appName) {
    head['unleash-appname'] = appName;
  }
  if (instanceId) {
    head['UNLEASH-INSTANCEID'] = instanceId;
  }
  if (etag) {
    head['If-None-Match'] = etag;
  }
  if (contentType) {
    head['Content-Type'] = contentType;
  }

  if (supportedClientSpecVersion) {
    head['Unleash-Client-Spec'] = supportedClientSpecVersion;
  }

  const version = details.version;
  head['unleash-sdk'] = `unleash-node-sdk:${version}`;

  if (headers) {
    Object.assign(head, headers);
  }
  // unleash-connection-id and unleash-sdk should not be overwritten
  if (connectionId) {
    head['unleash-connection-id'] = connectionId;
  }

  // expressed in milliseconds to match refreshInterval and metricsInterval units
  // attach when set explicitly to non-zero value
  head['unleash-interval'] = String(interval);

  return head;
};

export interface HttpClientConfig extends SDKData {
  timeout?: number;
  httpOptions?: HttpOptions;
}

export interface HttpClient {
  get(options: GetRequestOptions): Promise<Response>;
  post(options: PostRequestOptions): Promise<Response>;
}

const toResponse = async <T extends Response>(promise: Promise<T>): Promise<T> =>
  promise.catch((err: unknown) => {
    if (err && typeof err === 'object' && 'response' in err) {
      const response = (err as { response?: T }).response;
      if (response) {
        return response;
      }
    }
    throw err;
  });

export const createHttpClient = async ({
  appName,
  instanceId,
  connectionId,
  timeout,
  httpOptions,
}: HttpClientConfig): Promise<HttpClient> => {
  const ky = await getKyClient({ appName, instanceId, connectionId, timeout, httpOptions });

  return {
    post: ({ url, interval, headers, json }: PostRequestOptions) => {
      const requestOptions = {
        headers: buildHeaders({
          appName,
          instanceId,
          connectionId,
          interval,
          etag: undefined,
          contentType: 'application/json',
          headers,
        }),
        json,
        retry: defaultRetry,
      } as const;

      return toResponse(ky.post(url, requestOptions));
    },
    get: ({ url, etag, interval, headers }: GetRequestOptions) => {
      const requestOptions = {
        headers: buildHeaders({
          appName,
          instanceId,
          interval,
          etag,
          headers,
          connectionId,
        }),
        retry: defaultRetry,
      } as const;

      return toResponse(ky.get(url, requestOptions));
    },
  };
};
