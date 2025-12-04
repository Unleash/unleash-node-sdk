import type { URL } from 'node:url';
import { getProxyForUrl } from 'proxy-from-env';
import { type Dispatcher, ProxyAgent, Agent as UndiciAgent } from 'undici';
import details from './details.json';
import type { CustomHeaders } from './headers';
import { defaultRetry, getKyClient } from './http-client';
import type { HttpOptions } from './http-options';

export interface RequestOptions {
  url: string;
  timeout?: number;
  headers?: CustomHeaders;
}

export interface GetRequestOptions extends RequestOptions {
  etag?: string;
  appName?: string;
  instanceId?: string;
  connectionId: string;
  supportedSpecVersion?: string;
  httpOptions?: HttpOptions;
  interval?: number;
}

export interface Data {
  [key: string]: unknown;
}

export interface PostRequestOptions extends RequestOptions {
  json: Data;
  appName?: string;
  instanceId?: string;
  connectionId?: string;
  interval?: number;
  httpOptions?: HttpOptions;
}

export const getDefaultAgent = (url: URL, rejectUnauthorized?: boolean): Dispatcher => {
  const proxy = getProxyForUrl(url.href);
  const connect = rejectUnauthorized === undefined ? undefined : { rejectUnauthorized };

  if (!proxy || proxy === '') {
    return new UndiciAgent({ connect });
  }

  return new ProxyAgent({ uri: proxy, connect });
};

type HeaderOptions = {
  appName?: string;
  instanceId?: string;
  etag?: string;
  contentType?: string;
  custom?: CustomHeaders;
  specVersionSupported?: string;
  connectionId?: string;
  interval?: number;
};

export const buildHeaders = ({
  appName,
  instanceId,
  etag,
  contentType,
  custom,
  specVersionSupported,
  connectionId,
  interval,
}: HeaderOptions): Record<string, string> => {
  const head: Record<string, string> = {};
  if (appName) {
    // TODO: delete
    head['User-Agent'] = appName;
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
  if (specVersionSupported) {
    head['Unleash-Client-Spec'] = specVersionSupported;
  }

  const version = details.version;
  head['unleash-sdk'] = `unleash-node-sdk:${version}`;

  if (custom) {
    Object.assign(head, custom);
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

const resolveAgent = (httpOptions?: HttpOptions) =>
  httpOptions?.agent ||
  ((targetUrl: URL) => getDefaultAgent(targetUrl, httpOptions?.rejectUnauthorized));

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

export const post = async ({
  url,
  appName,
  timeout,
  instanceId,
  connectionId,
  interval,
  headers,
  json,
  httpOptions,
}: PostRequestOptions) => {
  const ky = await getKyClient();
  const requestOptions = {
    timeout: timeout || 10_000,
    headers: buildHeaders({
      appName,
      instanceId,
      connectionId,
      interval,
      etag: undefined,
      contentType: 'application/json',
      custom: headers,
    }),
    json,
    // ky's types are browser-centric; agent is supported by the underlying fetch in Node.
    agent: resolveAgent(httpOptions),
    retry: defaultRetry,
  } as const;

  return toResponse(ky.post(url, requestOptions));
};

export const get = async ({
  url,
  etag,
  appName,
  timeout,
  instanceId,
  connectionId,
  interval,
  headers,
  httpOptions,
  supportedSpecVersion,
}: GetRequestOptions) => {
  const ky = await getKyClient();
  const requestOptions = {
    timeout: timeout || 10_000,
    headers: buildHeaders({
      appName,
      instanceId,
      interval,
      etag,
      contentType: undefined,
      custom: headers,
      specVersionSupported: supportedSpecVersion,
      connectionId,
    }),
    agent: resolveAgent(httpOptions),
    retry: defaultRetry,
  } as const;

  return toResponse(ky.get(url, requestOptions));
};
