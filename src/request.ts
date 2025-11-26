import { HttpProxyAgent } from 'http-proxy-agent';
import { HttpsProxyAgent } from 'https-proxy-agent';
import * as http from 'http';
import * as https from 'https';
import { URL } from 'url';
import { getProxyForUrl } from 'proxy-from-env';
import { CustomHeaders } from './headers';
import { HttpOptions } from './http-options';
import { defaultRetry, getKyClient } from './http-client';
const details = require('./details.json');

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

type AgentOptions = http.AgentOptions & https.AgentOptions;

const httpAgentOptions: AgentOptions = {
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

  return isHttps
    ? new HttpsProxyAgent(proxy, agentOptions)
    : new HttpProxyAgent(proxy, agentOptions);
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

  return ky.post(url, requestOptions as any).catch((err: any) => {
    if (err?.response) {
      return err.response;
    }
    throw err;
  });
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

  return ky.get(url, requestOptions as any).catch((err: any) => {
    if (err?.response) {
      return err.response;
    }
    throw err;
  });
};
