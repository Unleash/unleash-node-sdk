import http from 'node:http';
import https from 'node:https';
import type { URL } from 'node:url';
import type { CollectedMetric, MetricBucket } from '@unleash/yggdrasil-engine';
import { HttpProxyAgent } from 'http-proxy-agent';
import { HttpsProxyAgent } from 'https-proxy-agent';
import fetch from 'make-fetch-happen';
import { getProxyForUrl } from 'proxy-from-env';
import details from './details.json';
import type { CustomHeaders } from './headers';
import type { HttpOptions } from './http-options';

declare var Bun:
  | {
      version: string;
    }
  | undefined;

declare var Deno:
  | {
      version: {
        deno: string;
      };
    }
  | undefined;

type PlatformName = 'bun' | 'deno' | 'node' | 'unknown';

export type PlatformData = {
  name: PlatformName;
  version: string;
};

export function getPlatformData(): PlatformData {
  if (typeof Bun !== 'undefined') {
    return { name: 'bun', version: Bun.version };
  } else if (typeof Deno !== 'undefined') {
    return { name: 'deno', version: Deno.version.deno };
  } else if (typeof process !== 'undefined' && process.versions && process.versions.node) {
    return { name: 'node', version: process.versions.node };
  } else {
    return { name: 'unknown', version: 'unknown' };
  }
}

export interface RegistrationData extends BaseMetricsData {
  sdkVersion: string;
  strategies: string[];
  started: Date;
  interval: number;
}

interface BaseMetricsData {
  appName: string;
  instanceId: string;
  connectionId: string;
  platformName: PlatformName;
  platformVersion: string;
  yggdrasilVersion: string;
  specVersion: string;
  sdkFlavor?: string;
  sdkFlavorVersion?: string;
}

export interface MetricsData extends BaseMetricsData {
  bucket?: MetricBucket;
  impactMetrics?: CollectedMetric[];
}

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

export interface PostRequestOptions extends RequestOptions {
  json: RegistrationData | MetricsData;
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

export const getDefaultAgent = (url: URL) => {
  const proxy = getProxyForUrl(url.href);
  const isHttps = url.protocol === 'https:';

  if (!proxy || proxy === '') {
    return isHttps ? httpsNoProxyAgent : httpNoProxyAgent;
  }

  return isHttps
    ? new HttpsProxyAgent(proxy, httpAgentOptions)
    : new HttpProxyAgent(proxy, httpAgentOptions);
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

export const post = ({
  url,
  appName,
  timeout,
  instanceId,
  connectionId,
  interval,
  headers,
  json,
  httpOptions,
}: PostRequestOptions) =>
  fetch(url, {
    timeout: timeout || 10000,
    method: 'POST',
    agent: httpOptions?.agent || getDefaultAgent,
    headers: buildHeaders({
      appName,
      instanceId,
      connectionId,
      interval,
      etag: undefined,
      contentType: 'application/json',
      custom: headers,
    }),
    body: JSON.stringify(json),
    strictSSL: httpOptions?.rejectUnauthorized,
  });

export const get = ({
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
}: GetRequestOptions) =>
  fetch(url, {
    method: 'GET',
    timeout: timeout || 10_000,
    agent: httpOptions?.agent || getDefaultAgent,
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
    retry: {
      retries: 2,
      maxTimeout: timeout || 10_000,
    },
    strictSSL: httpOptions?.rejectUnauthorized,
  });
