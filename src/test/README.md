# SDK test coverage

Preserve existing scenarios, fixtures, assertions, and snapshots when the behavior
still exists. Change setup and API calls to exercise the migrated SDK. Additional
lifecycle, transport, and consumer type tests supplement those original suites.

The original SDK, singleton, HTTP, retry, repository, streaming, instance-count,
client-evaluation, variant, strategy, and constraint suites are retained. Strategy
cases use a small harness that publishes their definitions through an injected
fetcher and calls SDK evaluation; it contains no evaluation logic. Client and
index snapshots are retained for supported APIs. All 279 installed specification
cases keep the original HTTP/event harness and strict result assertions.

Required adaptations include:

- Supply an engine to repository/metrics fixtures and inject fetchers into SDKs.
  Read accepted state from the engine and transport state from the fetcher.
- Add the state version to old HTTP/file fixtures and use full feature sets for
  inline bootstrap. Bootstrap availability is asserted on ready; live updates
  establish synchronization and changed events.
- Use string strategy parameters and constraint values, as received from the
  API. Date cases target currentTime explicitly: the old evaluator ignored the
  constraint field for dates. Rollout boundary cases retain the original hash
  result (33) instead of importing the deleted hashing helper.
- Expect empty strategy variant arrays in engine snapshots and an explicit
  undefined payload in SDK variants. Feature definitions are summaries with
  unspecified ordering. Missing flags have false feature status.
- Remove application/environment/flag labels from impact-metric assertions,
  following the accepted API removal. Counts still accrue in the engine when
  sending is disabled.
- Use mocked HTTP for the retry test rather than binding a local TCP port.
  Its three-request assertion is unchanged. Repair two unawaited event tests
  and ensure the 304 test waits for a response rather than resolving next tick.

Tests removed entirely concern APIs/implementations that no longer exist:
repository injection, single-definition and expanded-segment getters,
bootstrapOverride, forceGetVariant, internal createMetricsData, the local impact
registry/environment resolver, built-in class names, private random-generator
injection, and the hashing helper. Malformed-feature diagnostics are covered at
repository ingestion rather than in the deleted JavaScript evaluator. Missing
dependencies no longer produce the old JavaScript warning. Obsolete AVA snapshot
files are removed; active Vitest snapshots remain.

The retained tests expose unresolved behavior, rather than changing expectations
to make the migration pass:

- Four hostname cases fail with the currently pinned published engine. Publish
  an engine build with the hostname support previously discussed, then upgrade
  the dependency; no engine source is changed here.
- Three impact-metric cases fail because empty names/help now reach the engine.
  The SDK previously rejected these definitions. Restore those guards in the
  SDK or explicitly decide to remove that validation.

Four pre-existing skips remain: the global readiness case, repository timeout,
and two repository 429 backoff cases. No newly failing test is skipped. The
accepted E2 random variant/status bug remains an engine follow-up; passing the
specification data does not establish that scenario is fixed.

Run `npm test`, `npm run build`, and `npm run lint` from the repository root.
