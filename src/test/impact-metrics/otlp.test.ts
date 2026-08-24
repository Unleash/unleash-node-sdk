import { expect, test } from 'vitest';
import { otlpToImpactMetrics } from '../../impact-metrics/otlp';

const attrs = (o: Record<string, string>) =>
  Object.entries(o).map(([key, stringValue]) => ({ key, value: { stringValue } }));

test('turns a delta OTLP export into impact metrics, keeping only the allowed attributes as labels', () => {
  const request = {
    resourceMetrics: [
      {
        scopeMetrics: [
          {
            metrics: [
              {
                name: 'claude_code.token.usage',
                description: 'Tokens used',
                sum: {
                  isMonotonic: true,
                  aggregationTemporality: 1,
                  dataPoints: [
                    {
                      attributes: attrs({ model: 'claude-opus-5', 'session.id': 'abc' }),
                      asInt: '120',
                    },
                  ],
                },
              },
              {
                name: 'claude_code.active_time.total',
                sum: {
                  isMonotonic: true,
                  aggregationTemporality: 2,
                  dataPoints: [{ asDouble: 5 }],
                },
              },
              {
                name: 'tool.duration',
                description: 'Tool duration',
                histogram: {
                  aggregationTemporality: 1,
                  dataPoints: [
                    {
                      attributes: attrs({ tool_name: 'Bash' }),
                      count: '3',
                      sum: 4.5,
                      bucketCounts: ['1', '1', '1'],
                      explicitBounds: [1, 2],
                    },
                  ],
                },
              },
            ],
          },
        ],
      },
    ],
  };

  const metrics = otlpToImpactMetrics(request, { labels: ['model', 'tool_name'] });

  expect(metrics).toStrictEqual([
    {
      name: 'claude_code_token_usage',
      help: 'Tokens used',
      type: 'counter',
      samples: [{ labels: { model: 'claude-opus-5' }, value: 120 }],
    },
    {
      name: 'tool_duration',
      help: 'Tool duration',
      type: 'histogram',
      samples: [
        {
          labels: { tool_name: 'Bash' },
          count: 3,
          sum: 4.5,
          buckets: [
            { le: 1, count: 1 },
            { le: 2, count: 2 },
            { le: '+Inf', count: 3 },
          ],
        },
      ],
    },
  ]);
});
