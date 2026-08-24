// Spike: receive OTLP/JSON from an OTel emitter (e.g. Claude Code) and forward it to Unleash
// as impact metrics through the SDK. A fake Unleash on :4242 prints what it receives.
//
//   node examples/otlp-receiver.js
//   CLAUDE_CODE_ENABLE_TELEMETRY=1 OTEL_METRICS_EXPORTER=otlp OTEL_LOGS_EXPORTER=otlp \
//   OTEL_EXPORTER_OTLP_PROTOCOL=http/json OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318 \
//   OTEL_EXPORTER_OTLP_METRICS_TEMPORALITY_PREFERENCE=delta OTEL_LOG_TOOL_DETAILS=1 \
//   claude -p "run echo hi"
const http = require('node:http');
const { Unleash, otlpToImpactMetrics } = require('../lib');

const LABELS = ['model', 'type', 'tool_name', 'success', 'decision', 'source'];

const readJson = (req) =>
  new Promise((resolve) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => resolve(body ? JSON.parse(body) : {}));
  });

// Fake Unleash: empty flag set, prints every impactMetrics payload it is sent.
http
  .createServer(async (req, res) => {
    if (req.method === 'GET') {
      res.setHeader('content-type', 'application/json');
      return res.end(JSON.stringify({ version: 2, features: [] }));
    }
    const body = await readJson(req);
    if (body.impactMetrics) console.log('UNLEASH RECEIVED', JSON.stringify(body.impactMetrics, null, 2));
    res.statusCode = 202;
    res.end();
  })
  .listen(4242);

const unleash = new Unleash({
  url: 'http://localhost:4242/api/',
  appName: 'claude-code',
  environment: 'development',
  metricsInterval: 1000,
  disableAutoStart: false,
});

// Claude Code reports tool calls as log events, not metrics; count them by tool and outcome.
const toolEventsToMetrics = (body) => {
  const samples = new Map();
  for (const rl of body.resourceLogs ?? [])
    for (const sl of rl.scopeLogs ?? [])
      for (const rec of sl.logRecords ?? []) {
        const attrs = Object.fromEntries(
          (rec.attributes ?? []).map((a) => [a.key, a.value.stringValue ?? a.value.intValue]),
        );
        if (attrs['event.name'] !== 'tool_result') continue;
        const key = `${attrs.tool_name}|${attrs.success}`;
        samples.set(key, (samples.get(key) ?? 0) + 1);
      }
  if (samples.size === 0) return [];
  return [
    {
      name: 'claude_code_tool_result_total',
      help: 'Tool calls by tool and outcome',
      type: 'counter',
      samples: [...samples].map(([key, value]) => {
        const [tool_name, success] = key.split('|');
        return { labels: { tool_name, success }, value };
      }),
    },
  ];
};

http
  .createServer(async (req, res) => {
    const body = await readJson(req);
    const metrics =
      req.url === '/v1/metrics' ? otlpToImpactMetrics(body, { labels: LABELS }) : toolEventsToMetrics(body);
    console.log(`${req.url}: ${metrics.length} metrics ->`, metrics.map((m) => m.name).join(', '));
    unleash.impactMetrics.ingest(metrics);
    res.end('{}');
  })
  .listen(4318, () => console.log('OTLP receiver on :4318, fake Unleash on :4242'));
