import http from 'node:http';
import https from 'node:https';
import type { URL } from 'node:url';
import { getProxyForUrl } from 'proxy-from-env';
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

const httpAgentOptions: http.AgentOptions = {
  keepAlive: true,
  keepAliveMsecs: 30 * 1000,
  timeout: 10 * 1000,
};

const httpNoProxyAgent = new http.Agent(httpAgentOptions);
const httpsNoProxyAgent = new https.Agent(httpAgentOptions);

export const getDefaultAgent = (url: URL, rejectUnauthorized?: boolean) => {
  const proxy = getProxyForUrl(url.href);
  const isHttps = url.protocol === 'https:';
  const agentOptions =
    rejectUnauthorized === undefined
      ? httpAgentOptions
      : { ...httpAgentOptions, rejectUnauthorized };

  if (!proxy || proxy === '') {
    if (isHttps && rejectUnauthorized !== undefined) {
      return new https.Agent(agentOptions);
    }
    return isHttps ? httpsNoProxyAgent : httpNoProxyAgent;
  }

  // Fallback for callers that still expect a Node.js Agent (non-ky usage).
  return isHttps ? new https.Agent(agentOptions) : new http.Agent(agentOptions);
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

const withRejectUnauthorized = async <T>(
  rejectUnauthorized: boolean | undefined,
  fn: () => Promise<T>,
): Promise<T> => {
  if (rejectUnauthorized === false) {
    const prev = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    try {
      return await fn();
    } finally {
      if (prev === undefined) {
        delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
      } else {
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = prev;
      }
    }
  }
  return fn();
};

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

  return withRejectUnauthorized(httpOptions?.rejectUnauthorized, () =>
    ky.post(url, requestOptions).catch((err: any) => {
      if (err?.response) {
        return err.response;
      }
      throw err;
    }),
  );
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

  return withRejectUnauthorized(httpOptions?.rejectUnauthorized, () =>
    ky.get(url, requestOptions as any).catch((err: any) => {
      if (err?.response) {
        return err.response;
      }
      throw err;
    }),
  );
};
