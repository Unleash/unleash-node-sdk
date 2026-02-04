# Unleash Client SDK for Node.js

[![Unleash node SDK on npm](https://img.shields.io/npm/v/unleash-client)](https://www.npmjs.com/package/unleash-client)
![npm downloads](https://img.shields.io/npm/dm/unleash-client)
[![Build Status](https://github.com/Unleash/unleash-node-sdk/actions/workflows/build-and-test.yaml/badge.svg)](https://github.com/Unleash/unleash-node-sdk/actions)
[![Code Climate](https://codeclimate.com/github/Unleash/unleash-node-sdk/badges/gpa.svg)](https://codeclimate.com/github/Unleash/unleash-node-sdk)
[![Coverage Status](https://coveralls.io/repos/github/Unleash/unleash-node-sdk/badge.svg?branch=main)](https://coveralls.io/github/Unleash/unleash-node-sdk?branch=main)

Unleash is a private, secure, and scalable [feature management platform](https://www.getunleash.io/)
built to reduce the risk of releasing new features and accelerate software development. This
server-side Node.js SDK is designed to help you integrate with Unleash and evaluate feature flags
inside your application.

You can use this client with
[Unleash Enterprise](https://www.getunleash.io/pricing?utm_source=readme&utm_medium=nodejs) or
[Unleash Open Source](https://github.com/Unleash/unleash).

## Getting started

### 1. Install the Unleash client in your project

```bash
npm install unleash-client
```

or

```bash
yarn add unleash-client
```

(Or any other tool you like.)

### 2. Initialize `unleash-client`

Once installed, you must initialize the SDK in your application. By default, Unleash initialization
is asynchronous, but if you need it to be synchronous, you can
[block until the SDK has synchronized with the server](#synchronous-initialization).

Note that until the SDK has synchronized with the API, all features will evaluate to `false` unless
you have a [bootstrapped configuration](#bootstrap).

---

💡 **Tip**: All code samples in this section will initialize the SDK and try to connect to the
Unleash instance you point it to. You will need an Unleash instance and a
[server-side API token](https://docs.getunleash.io/reference/api-tokens-and-client-keys#client-tokens)
for the connection to be successful.

---

We recommend that you initialize the Unleash client SDK **as early as possible** in your
application. The SDK will set up an in-memory repository and poll for updates from the Unleash
server at regular intervals.

```js
import { initialize } from 'unleash-client';

const unleash = initialize({
  url: 'https://YOUR-API-URL',
  appName: 'my-node-name',
  customHeaders: { Authorization: '<YOUR_API_TOKEN>' },
});
```

The `initialize` function will configure a **global** Unleash instance. If you call this method
multiple times, the global instance will be changed. You will **not** create multiple instances.

#### How do I know when it's ready?

Because the SDK takes care of talking to the server in the background, it can be difficult to know
exactly when it has connected and is ready to evaluate toggles. If you want to run some code when
the SDK becomes ready, you can listen for the `'synchronized'` event:

```js
unleash.on('synchronized', () => {
  // the SDK has synchronized with the server
  // and is ready to serve
});
```

Refer to the [events reference](#events) later in this document for more information on events and
an exhaustive list of all the events the SDK can emit.

The `initialize` function will configure and create a _global_ Unleash instance. When a global
instance exists, calling this method has no effect. Call the `destroy` function to remove the
globally configured instance.

#### Constructing the Unleash client directly

You can also construct the Unleash instance yourself instead of via the `initialize` method.

When using the Unleash client directly, you **should not create new Unleash instances on every
request**. Most applications are expected to only have a single Unleash instance (singleton). Each
Unleash instance will maintain a connection to the Unleash API, which may result in flooding the
Unleash API.

```js
import { Unleash } from 'unleash-client';

const unleash = new Unleash({
  url: 'https://YOUR-API-URL',
  appName: 'my-node-name',
  customHeaders: { Authorization: '<YOUR_API_TOKEN>' },
});

unleash.on('ready', console.log.bind(console, 'ready'));

// optional error handling when using unleash directly
unleash.on('error', console.error);
```

#### Synchronous initialization

You can also use the `startUnleash` function and `await` to wait for the SDK to have fully
synchronized with the Unleash API. This guarantees that the SDK is not operating on local and
potentially stale feature toggle configuration.

```js
import { startUnleash } from 'unleash-client';

const unleash = await startUnleash({
  url: 'https://YOUR-API-URL',
  appName: 'my-node-name',
  customHeaders: { Authorization: '<YOUR_API_TOKEN>' },
});

// The Unleash SDK now has a fresh state from the Unleash API
const isEnabled = unleash.isEnabled('Demo');
```

### 3. Check features

With the SDK initialized, you can use it to check the states of your feature toggles in your
application.

The primary way to check feature toggle status is to use the `isEnabled` method on the SDK. It takes
the name of the feature and returns `true` or `false` based on whether the feature is enabled or
not.

```javascript
setInterval(() => {
  if (unleash.isEnabled('DemoToggle')) {
    console.log('Toggle enabled');
  } else {
    console.log('Toggle disabled');
  }
}, 1000);
```

👀 **Note**: In this example, we've wrapped the `isEnabled` call inside a `setInterval` function. In
the event that all your app does is start the SDK and check a feature status, this setup ensures
that the node app keeps running until the SDK has synchronized with the Unleash API. It is **not**
required in normal apps.

#### Check variants

You can use the `getVariant` method to retrieve the variant of a feature flag. If the flag is
disabled or doesn't have any variants, the method returns the
[disabled variant](https://docs.getunleash.io/reference/feature-toggle-variants#the-disabled-variant).

```js
const variant = unleash.getVariant('demo-variant');

if (variant.name === 'blue') {
  // do something with the blue variant...
}
```

#### Providing an Unleash context

Calling the `isEnabled` method with just a feature name will work in simple use cases, but in many
cases you'll also want to provide an
[Unleash context](https://docs.getunleash.io/reference/unleash-context). The SDK uses the Unleash
context to evaluate any
[activation strategy](https://docs.getunleash.io/reference/activation-strategies) with
[strategy constraints](https://docs.getunleash.io/reference/strategy-constraints), and also to
evaluate some of the built-in strategies.

The `isEnabled` accepts an Unleash context object as a second argument:

```js
const unleashContext = {
  userId: '123',
  sessionId: 'some-session-id',
  remoteAddress: '127.0.0.1',
  properties: {
    region: 'EMEA',
  },
};

const enabled = unleash.isEnabled('someToggle', unleashContext);
```

### 4. Stop unleash

To shut down the client (turn off the polling) you can simply call the `destroy` method. This is
typically not required.

```js
import { destroy } from 'unleash-client';
destroy();
```

### Built-in activation strategies

The client supports all built-in activation strategies provided by Unleash.

Read more about
[activation strategies in the official docs](https://docs.getunleash.io/reference/activation-strategies).

### Unleash context

In order to use some of the common activation strategies you must provide an
[Unleash context](https://docs.getunleash.io/reference/unleash-context). This client SDK allows you
to send in the unleash context as part of the `isEnabled` call:

```javascript
const unleashContext = {
  userId: '123',
  sessionId: 'some-session-id',
  remoteAddress: '127.0.0.1',
};
unleash.isEnabled('someToggle', unleashContext);
```

## TypeScript: Custom Feature Toggle Names

You can use TypeScript module augmentation to provide type safety for your feature toggle names.
This ensures that only specific feature names can be used with `isEnabled` and related methods,
catching typos at compile time.

```typescript
import { initialize } from 'unleash-client';

declare module 'unleash-client' {
  interface UnleashTypes {
    flagNames: 'aaa' | 'bbb';
  }
}

const client = initialize({});

client.isEnabled('aaa');
client.isEnabled('bbb');
client.isEnabled('ccc'); // Error
```

## Advanced usage

The initialize method takes the following arguments:

- **url** - The url to fetch toggles from (required).
- **appName** - The application name / codebase name (required).
- **environment** - The value to put in the Unleash context's `environment` property. Automatically
  populated in the Unleash Context (optional). This does **not** set the SDK's
  [Unleash environment](https://docs.getunleash.io/reference/environments).
- **instanceId** - A unique identifier, should/could be somewhat unique.
- **refreshInterval** - The poll interval to check for updates. Defaults to 15000ms.
- **metricsInterval** - How often the client should send metrics to Unleash API. Defaults to
  60000ms.
- **strategies** - Custom activation strategies to be used.
- **disableMetrics** - Disable metrics.
- **customHeaders** - Provide a map(object) of custom headers to be sent to the unleash-server.
- **customHeadersFunction** - Provide a function that returns a Promise resolving as custom headers
  to be sent to unleash-server. When options are set, this will take precedence over `customHeaders`
  option.
- **timeout** - Specify a timeout in milliseconds for outgoing HTTP requests. Defaults to 10000ms.
- **repository** - Provide a custom repository implementation to manage the underlying data.
- **httpOptions** - Provide custom HTTP options such as `rejectUnauthorized` - be careful with these
  options as they may compromise your application security.
- **namePrefix** - Only fetch feature toggles with the provided name prefix.
- **tags** - Only fetch feature toggles tagged with the list of tags, such as:
  `[{name: 'simple', value: 'proxy'}]`.

## Custom strategies

### 1. Implement the custom strategy

```js
import { initialize, Strategy } from 'unleash-client';
class ActiveForUserWithEmailStrategy extends Strategy {
  constructor() {
    super('ActiveForUserWithEmail');
  }

  isEnabled(parameters, context) {
    return parameters.emails.indexOf(context.email) !== -1;
  }
}
```

### 2. Register your custom strategy

```js
initialize({
  url: 'http://unleash.herokuapp.com',
  customHeaders: {
    Authorization: 'API token',
  },
  strategies: [new ActiveForUserWithEmailStrategy()],
});
```

## Events

The unleash instance object implements the EventEmitter class and **emits** the following events:

| event        | payload                          | description                                                                                                                                                                                                                                  |
| ------------ | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ready        | -                                | is emitted once the fs-cache is ready. if no cache file exists it will still be emitted. The client is ready to use, but might not have synchronized with the Unleash API yet. This means the SDK still can operate on stale configurations. |
| synchronized | -                                | is emitted when the SDK has successfully synchronized with the Unleash API, or when it has been bootstrapped, and has all the latest feature toggle configuration available.                                                                 |
| registered   | -                                | is emitted after the app has been registered at the API server                                                                                                                                                                               |
| sent         | `object` data                    | key/value pair of delivered metrics                                                                                                                                                                                                          |
| count        | `string` name, `boolean` enabled | is emitted when a feature is evaluated                                                                                                                                                                                                       |
| warn         | `string` msg                     | is emitted on a warning                                                                                                                                                                                                                      |
| error        | `Error` err                      | is emitted on an error                                                                                                                                                                                                                       |
| unchanged    | -                                | is emitted each time the client gets new toggle state from server, but nothing has changed                                                                                                                                                   |
| changed      | `object` data                    | is emitted each time the client gets new toggle state from server and changes have been made                                                                                                                                                 |
| impression   | `object` data                    | is emitted for every user impression (isEnabled / getVariant)                                                                                                                                                                                |

Example usage:

```js
import { initialize } from 'unleash-client';

const unleash = initialize({
  appName: 'my-app-name',
  url: 'http://unleash.herokuapp.com/api/',
  customHeaders: {
    Authorization: 'API token',
  },
});

// Some useful life-cycle events
unleash.on('ready', console.log);
unleash.on('synchronized', console.log);
unleash.on('error', console.error);
unleash.on('warn', console.warn);

unleash.once('registered', () => {
  // Do something after the client has registered with the server API.
  // Note: it might not have received updated feature toggles yet.
});

unleash.once('changed', () => {
  console.log(`Demo is enabled: ${unleash.isEnabled('Demo')}`);
});

unleash.on('count', (name, enabled) => console.log(`isEnabled(${name})`));
```

## Impact metrics

Impact metrics are lightweight, application-level time-series metrics stored and visualized directly inside Unleash. They allow you to connect specific application data, such as request counts, error rates, or memory usage, to your feature flags and release plans.

Use impact metrics to validate feature impact and automate your release process. For example, you can monitor usage patterns or performance to see if a feature is meeting its goals. By combining impact metrics with release templates, you can reduce manual release operations and automate milestone progression based on metric thresholds.

The SDK automatically attaches the following context labels to your metrics: `appName`, `environment`, and `origin` (for example, `origin=sdk` or `origin=Edge`).

### Counters

Use counters for cumulative values that only increase, such as the total number of requests or errors.

```js
const unleash = initialize({
  url: 'https://YOUR-API-URL',
  appName: 'my-node-name',
  customHeaders: { Authorization: '<YOUR_API_TOKEN>' },
});

unleash.impactMetrics.defineCounter(
  'request_count',
  'Total number of HTTP requests processed'
);

unleash.impactMetrics.incrementCounter('request_count');
```

### Gauges

Use gauges for point-in-time values that can go up or down:

```js
unleash.impactMetrics.defineGauge(
  'total_users',
  'Total number of registered users'
);

unleash.impactMetrics.updateGauge('total_users', userCount);
```

### Histograms

Histograms measure value distribution (request duration, response size):

```js
unleash.impactMetrics.defineHistogram(
  'request_time_ms',
  'Time taken to process a request in milliseconds',
  [50, 100, 200, 500, 1000]
);

unleash.impactMetrics.observeHistogram('request_time_ms', 125);
```

Impact metrics are batched and sent on the same interval as regular SDK metrics. They are ingested via the regular metrics endpoint.

## Bootstrap

> Available from v3.11.x

The Node.js SDK supports a bootstrap parameter, allowing you to load the initial feature toggle
configuration from somewhere else than the Unleash API. The bootstrap `data` can be provided as an
argument directly to the SDK, as a `filePath` to load, or as a `url` to fetch the content from.
Bootstrap is a convenient way to increase resilience, where the SDK can still load fresh toggle
configuration from the bootstrap location, even if the Unleash API should be unavailable at startup.

### 1. Bootstrap with data passed as an argument

```js
const client = initialize({
  appName: 'my-application',
  url: 'https://app.unleash-hosted2.com/demo/api/',
  customHeaders: { Authorization: '<YOUR_API_TOKEN>' },
  bootstrap: {
    data: [
      {
        enabled: false,
        name: 'BootstrapDemo',
        description: '',
        project: 'default',
        stale: false,
        type: 'release',
        variants: [],
        strategies: [{ name: 'default' }],
      },
    ],
  },
});
```

### 2. Bootstrap via a URL

```js
const client = initialize({
  appName: 'my-application',
  url: 'https://app.unleash-hosted.com/demo/api/',
  customHeaders: { Authorization: '<YOUR_API_TOKEN>' },
  bootstrap: {
    url: 'http://localhost:3000/proxy/client/features',
    urlHeaders: {
      Authorization: 'bootstrap',
    },
  },
});
```

### 3. Bootstrap from a file

```js
const client = initialize({
  appName: 'my-application',
  url: 'https://app.unleash-hosted.com/demo/api/',
  customHeaders: { Authorization: '<YOUR_API_TOKEN>' },
  bootstrap: {
    filePath: '/tmp/some-bootstrap.json',
  },
});
```

## Toggle definitions

Sometimes you might be interested in the raw feature toggle definitions.

```js
import {
  initialize,
  getFeatureToggleDefinition,
  getFeatureToggleDefinitions,
} from 'unleash-client';

initialize({
  url: 'http://unleash.herokuapp.com/api/',
  customHeaders: { Authorization: '<YOUR_API_TOKEN>' },
  appName: 'my-app-name',
  instanceId: 'my-unique-instance-id',
});

const featureToggleX = getFeatureToggleDefinition('app.ToggleX');
const featureToggles = getFeatureToggleDefinitions();
```

## Custom store provider

(Available from v3.11.x)

By default, this SDK will use a store provider that writes a backup of the feature toggle
configuration to a **file on disk**. This happens every time it receives updated configuration from
the Unleash API. You can swap out the store provider with either the provided in-memory store
provider or a custom store provider implemented by you.

### 1. Use `InMemStorageProvider`

```js
import { initialize, InMemStorageProvider } from 'unleash-client';

const client = initialize({
  appName: 'my-application',
  url: 'http://localhost:3000/api/',
  customHeaders: { Authorization: '<YOUR_API_TOKEN>' },
  storageProvider: new InMemStorageProvider(),
});
```

### 2. Custom store provider backed by Redis

```js
import { initialize, InMemStorageProvider } from 'unleash-client';

import { createClient } from 'redis';

class CustomRedisStore {
  async set(key, data) {
    const client = createClient();
    await client.connect();
    await client.set(key, JSON.stringify(data));
  }
  async get(key) {
    const client = createClient();
    await client.connect();
    const data = await client.get(key);
    return JSON.parse(data);
  }
}

const client = initialize({
  appName: 'my-application',
  url: 'http://localhost:3000/api/',
  customHeaders: {
    Authorization: 'my-key',
  },
  storageProvider: new CustomRedisStore(),
});
```

## Custom repository

You can manage the underlying data layer yourself if you want to. This enables you to use Unleash
offline, from a browser environment, or by implement your own caching layer. See
[example](examples/custom_repository.js).

Unleash depends on a `ready` event of the repository you pass in. Be sure that you emit the event
**after** you've initialized Unleash.

## Usage with HTTP and HTTPS proxies

You can connect to the Unleash API through the corporate proxy by setting one of the environment
variables: `HTTP_PROXY` or `HTTPS_PROXY`.

## Design philosophy

This feature flag SDK is designed according to our design philosophy. You can
[read more about that here](https://docs.getunleash.io/topics/feature-flags/feature-flag-best-practices).
