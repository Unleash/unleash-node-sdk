# Yggdrasil migration review — 2026-11-03

## Test migration revised — 2026-11-10

The earlier replacement-suite pass was too broad. Original SDK, repository,
metrics, client, variant, strategy, constraint, singleton, network, and instance
count tests have been restored and adapted to the new boundaries. Active Vitest
snapshots and the original HTTP-based specification harness are retained.
Additional tests cover migration-specific lifecycle and type behavior. See
[src/test/README.md](src/test/README.md) for the adaptation/deletion rationale.

The restored assertions expose two unresolved issues:

- **Hostname targeting:** four original positive cases fail against the pinned
  published engine, including OS hostname and HOSTNAME environment cases. The
  backing-code fix discussed earlier is not effective in this dependency build.
  Publish a build with the hostname support and upgrade the SDK dependency. No
  engine source has been changed.
- **Impact-metric definition validation:** three original cases fail because
  empty names/help are now forwarded and registered. The SDK previously ignored
  these definitions. Restore SDK validation or explicitly accept this removal.

The full suite currently reports **616 passed, 7 failed, 4 pre-existing skipped**.
All **279 installed specification cases pass**, with no specification exclusions.
No newly failing test was skipped or given a passing expectation. No SDK or
engine runtime code was changed. Build and lint pass. Examples remain unrun.

## Current integration state

The checkout is now **chore/swap-to-yggdrasil**, at `0e7e28a` plus the working-tree integration patch. The published dependency commit has been brought onto this branch. Local main remains at `c1dbb98`, where only the development dependency was added and the JavaScript SDK remains in place.

The migration now declares **@unleash/yggdrasil-engine@0.1.0-alpha.1 as a runtime dependency**. All SDK imports use that scoped package's root exports, including types and version functions previously imported from deep wasm paths. yarn.lock already pins this exact package/version; moving it from devDependencies to dependencies does not change the lock entry.

An old unscoped engine still exists in the local installation, but SDK imports no longer reference it. Production compiler resolution was checked, and the actual repository was exercised while unscoped engine resolution was explicitly rejected. Neither check used an alias to redirect the SDK imports.

The working-tree patch changes SDK import wiring and dependency placement; this document has been updated alongside it. The obsolete variant evaluator has been removed (B2 resolved). Initial checks covered production-only compilation and package loading. Build/lint pass; restored regression tests now expose the failures listed above. Examples remain unrun.

## Integration status and accepted behavior

### B1. Resolved: the SDK now uses the published package

Evidence: [package.json](package.json), [yarn.lock](yarn.lock), [engine construction](src/unleash.ts), [repository imports](src/repository/index.ts).

The dependency/lock changes are on the migration branch, the engine is in runtime dependencies, and all SDK imports now use @unleash/yggdrasil-engine root exports. No unscoped or deep engine imports remain in SDK source.

A production-only compiler check confirmed every loaded engine declaration comes from the scoped package. A repository runtime check applied and persisted a flag with the published engine while rejecting any attempt to resolve the old unscoped package. No clean install was performed. After B2 cleanup, the emitted package entry point and focused variant evaluation were also exercised successfully with unscoped engine resolution blocked.

### B2. Resolved: the obsolete variant evaluator and broken imports are removed

Evidence: [variant.ts](src/variant.ts).

The module now contains PayloadType, Payload, Variant, VariantWithFeatureStatus, defaultVariant, and the deprecated getDefaultVariant compatibility helper. The old selection functions, private selection helpers, unused VariantDefinition/Override types, and all four evaluator imports have been removed. There were no remaining production callers of those selection functions.

Production-only TypeScript compilation now emits JavaScript and declarations with zero diagnostics. The emitted package root loads successfully, and a focused check verifies engine-selected variants/payloads, caller fallbacks, both feature-status fields, retained defaults, and destruction while unscoped engine resolution is blocked.

The test suite has since been migrated to the new contract. The normal build, including test source in tsconfig, now passes along with the full suite and lint.

### E1. Accepted limitation: custom-strategy parent dependencies

Evidence: published `lib/unleash-engine.js::isEnabled/checkVariant` and `lib/custom-strategies.js::evaluateCustomStrategies`; migration SDK engine calls in unleash.ts.

Custom results are calculated only for the requested flag and then reused while the core checks parents. A focused check against **the published package** returned **parent enabled: true, dependent child enabled: false** when the parent used a custom strategy returning true and the child used default.

A parent's indexed custom result can also be substituted with an unrelated child's result. Main recursively evaluated the parent's actual implementation. This behavior is accepted for this migration; no parent-custom-strategy patch is requested.

### E2. Known bug, accepted for now: random targeting disagrees with variant status

Evidence: migration `src/unleash.ts::getVariant` calls engine.checkVariant; published WASM behavior reproduced directly.

A 50% rollout using random stickiness produced **98 inconsistent variant/status results out of 200 calls** in this pass. Variant selection can return an enabled variant while featureEnabled is false, or a disabled variant while featureEnabled is true. The SDK copies this status and counts it, so the discrepancy affects both application behavior and metrics.

This remains a bug needing an engine follow-up, but is explicitly accepted for now. The eventual fix should derive variant and feature status from one targeting decision. Correct SDK fallback handling cannot repair independently calculated engine results. No engine patch is requested in this pass.

### E3. Accepted behavior: eager custom strategies and exception fallbacks

Evidence: published `lib/custom-strategies.js::evaluateCustomStrategies`; the try/catch in all three wrapper evaluation methods; migration `src/unleash.ts::isEnabled/getVariant` fallback paths.

The wrapper eagerly runs custom strategies before global enablement, dependencies, constraints, or an earlier matching strategy have ruled them out. Main skipped unreachable callbacks.

The observable failure has changed since the previous review. The published wrapper **catches** callback/evaluation exceptions and returns an undefined enabled/variant result with impressionData false. The SDK consequently uses its fallback. It no longer necessarily throws the exception to the application.

Reproduced with a throwing custom strategy:

- A globally disabled flag returned an undefined engine enabled result. With SDK fallback true, the existing fallback path returns **true**, although main would return false without invoking that callback.
- A flag with an earlier matching default strategy also returned an undefined result. With the default false fallback, it can return **false** although main would return true.

A custom callback can therefore change targeting results even when main would have skipped it. Its exception is indistinguishable to the SDK from a missing flag, with no diagnostic returned. Eager execution and exception-to-fallback handling are accepted as the new behavior; no compatibility patch is requested.

### E5. Intentional alignment: address-only default variant stickiness changes

Evidence: focused published-engine variant lookup; compare main's variant.ts::getSeed.

Main used user ID, then session ID, then remote address for default variant stickiness. Repeated published-engine lookups using only the same remoteAddress returned **both red and blue**. Existing address-only users can change experiment assignments between requests.

This change is intentional to align with the other SDKs. Explicit stickiness remoteAddress remains available for address-based assignment; the old default fallback will not be restored.

### E6. Accepted behavior difference: restored metric collection windows

Evidence: published getMetrics()/restoreMetrics() checks; migration metrics.ts restoration calls.

Counts and nested variant counts survive restoration. The original bucket start does not: collecting advances it, and restoration adds old counts back without returning to the earlier start. Main restored counts and the original start.

The focused check retained one count but moved the next bucket's start to the first collection's stop time. Failed uploads can attribute old counts to a later, shorter reporting window. This is an accepted behavior difference; no timestamp-restoration patch is requested.

### S1. Accepted and documented: bootstrap provides readiness only

Evidence: [README startup contract](README.md#readiness-and-bootstrap), [bootstrap load](src/repository/index.ts).

The public contract is:

- Bootstrap loads usable state and emits ready when it is the first source to make the client ready.
- Bootstrap is not persisted. Applications that need it after a restart must provide it again; a backup previously persisted from live state is a separate source.
- Applying bootstrap does not emit changed or synchronized.
- Live updates emit changed and establish synchronization; bootstrap and backup alone do not.
- startUnleash waits for synchronized, so it can remain pending without a live update. Applications wanting to use local startup state should wait for ready instead.

Main's save-based bootstrap path emitted changed, indirectly synchronized, and persisted the snapshot. All three changes are accepted. README now documents the distinction and gives an example using new Unleash plus once(client, 'ready'). No new public API is introduced: the existing readiness event covers this contract.

## What is fixed or deliberately settled

| Topic | Current assessment |
| --- | --- |
| Rejected update mutates custom state (old E4) | **Fixed in the published wrapper and reverified.** takeState calls WASM first and only updates custom definitions after it succeeds. An invalid snapshot was rejected; evaluation stayed true and parameters stayed old. The SDK now imports that published package directly. |
| Plain-object state/parameters/metrics | Verified in the published package. Nested maps are records/objects; custom parameters survive JSON state reload and metric counts restore. No special serializer is needed. JSON omission of undefined fields such as query is normal and is not data loss. |
| Hostname targeting | User reported the backing-engine wasm-bindgen hostname fix. Treated as resolved; this pass did not rerun hostname behavior or propose an SDK workaround. |
| Flag-name typing | Migration has the restored root UnleashTypes augmentation hook and conditional Name type. Focused compiler checks against the published declarations accept default strings and configured literal unions, rejecting undeclared names through singleton and instance calls. |
| Custom strategy API | Migration exports Strategy as a type-only structural interface. Plain/inline objects type-check. The abstract/default base class is gone; instantiation is rejected. |
| Runtime mode switching | Intentionally removed from the migration's public SDK. Configure initial mode or the supplied fetcher; automatic server-directed behavior remains internal. Main still has the old public method until the migration lands. |
| Impact labels | Automatic application/environment labels and deprecated per-flag context labels are intentionally removed in the migration. Their absence is a migration requirement, not a restoration request. |
| Disabled metrics collection | Accepted: evaluations continue counting in the live engine even when sending is disabled. Public count events remain suppressed with disabled sending. No collection-disable workaround is requested. |
| Bootstrap precedence | bootstrapOverride is deliberately removed in the migration. Live updates > bootstrap > backup is accepted precedence. |
| Ready versus synchronized | Bootstrap/backup can satisfy ready; live updates satisfy synchronized. Bootstrap emits neither changed nor synchronized and is not persisted. startUnleash waits for synchronized. Applications using local startup state wait for ready. Documented in README. |
| Fetcher injection | Migration keeps the repository internal and accepts an injected fetcher. Snapshot checks using the published engine confirmed bootstrap readiness, live synchronization despite storage-write failure, and ignored updates after stop. |
| Other SDK repairs | Migration retains variant fallback handling, both feature-status fields, impression opt-in/enhanced context, count events, timer rescheduling, header-before-drain ordering, compilation warnings, and explicit/idempotent engine destruction. E1/E3 are accepted behaviors. E2 remains a known engine bug accepted for now. |

## User-facing migration checklist

These are differences between the JavaScript SDK on main and the intended migration branch. They are not changes delivered by main's dependency-only commit.

| User surface | Migration requirement |
| --- | --- |
| repository configuration | Replace repository injection with fetcher injection. A fetcher extends EventEmitter, implements async start, synchronous stop, and registerUpdate(sink), then awaits the sink with full snapshots/deltas. The SDK retains bootstrap, storage, engine ownership, and lifecycle. Passing the old repository option from JS would be ignored. |
| bootstrapOverride | Remove the option. Bootstrap always outranks backup, and live state outranks both. |
| Inline bootstrap | Replace data: featureArray plus segments with features: fullClientFeaturesResponse. The outer features property contains version, inner features, and segments. Old inline data shapes silently provide no bootstrap data in JavaScript. |
| State/provider types | ClientFeaturesResponse is no longer root-exported. Bootstrap/storage/fetchers use engine ClientFeatures/ClientFeaturesDelta. The published package exports these types; the SDK now imports that published package directly (B1 resolved). |
| Generated transport typing | Record-valued maps are appropriate. Some fields remain required-with-undefined, including query and strategy variants, and constraint value narrows to string. TypeScript callers need more than renamed imports. |
| Strategy | Root Strategy changes from runtime class to type-only interface with readonly name and synchronous boolean isEnabled(parameters, context). Plain objects/classes are supported. Existing extends/new Strategy code and imports of deleted built-in strategy modules need migration. |
| Strategy hooks | Constructor return value, mutable name, constraint helpers, isEnabledWithConstraints, and getResult/custom result-variant overrides disappear. Constraints and variants are engine-owned. |
| Flag names | Continue augmenting root UnleashTypes with a string-literal flagNames union for isEnabled. Name defaults to string when unconfigured. getVariant remains string-based. |
| forceGetVariant | Package and instance methods removed; migrate to getVariant and review reliance on the previous special path. |
| getFeatureToggleDefinition(name) | Package and instance single-definition lookup removed. No public full-definition replacement is provided. |
| getFeatureToggleDefinitions(withFullSegments?) | Becomes no-argument summary enumeration: name, optional type, project, global enabled. No strategies, variants, constraints, dependencies, description, stale/impression settings, or expanded segments. Root calls before initialization return [] instead of undefined. |
| changed event | Carries summaries instead of full definitions. Bootstrap intentionally emits only ready and is not persisted, as documented in S1. |
| Manual count/countVariant | Package and instance methods removed. No public manual recording replacement. Automatic engine counts remain. |
| Evaluation events | Public count events remain when sending is enabled. Impressions respect opt-in and use enhanced context. Dependency evaluation no longer produces separate parent SDK impressions. Main already did not forward a top-level countVariant event. |
| setExperimentalMode | Public method removed. Initial experimentalMode and default adaptive fetching remain. |
| Impact arguments/events | Deprecated third flagContext arguments and MetricsAPI EventEmitter behavior disappear. Missing metrics can be ignored without the old wrapper warnings; empty name/help validation also changes. |
| Impact counter values | Safe integers required. Fractions, NaN, infinities, and unsafe integers now throw RangeError; main accepted positive finite fractions and ignored non-finite values. Verified against the published package. |
| Metric labels | Application/environment and per-flag labels are intentionally absent. Update queries relying on them. |
| Telemetry | Published core reports 0.21.7 and spec 6.1.0. Migration reports real core version instead of null and the engine's spec instead of 5.2.0. In-process sent bucket dates become strings instead of Date objects; JSON wire dates were already strings. |
| destroy | Idempotent and frees the engine. Subsequent enabled/variant calls resolve fallbacks and definitions return []; impact calls against the freed engine throw. Main could still evaluate retained repository data. |
| Deep imports/subclasses | Deleted client/feature/strategy files and protected client/metricRegistry hooks break consumers depending on internal modules. Repository and metric bucket/manipulation internals are also removed. |

## Further compatibility questions

- Published built-in overrides remain ignored: a supplied default implementation returning false still produced true. Main preferred supplied implementations. Duplicate custom names now use the last registration rather than the first.
- Conflicting top-level custom context and properties values still resolve in favor of properties in the binding; main preferred the non-null top-level field. The published check for tenant A versus properties tenant B returned false for an A constraint. Custom callbacks receive the original object and may resolve it differently.
- Numeric empty/whitespace strings, list trimming/empty entries, date-field selection/parsing, and missing strategies changed when evaluation moved to Rust. Prior concrete reproductions are historical evidence; those individual constraint edge cases were not rerun in this pass. Treat specification conformance separately from preserving main's quirks.
- Default stickiness for empty IDs, regex/CIDR/semver boundaries, segment failures, variant overrides, and the full dependency matrix still need parity/specification coverage. This review does not assert unverified failures for them.
- Published impact-only collections omit bucket and have empty labels. The migration forwards that shape, whereas main always sends a bucket. Endpoint acceptance remains unverified. Empty gauge samples and empty impact arrays are additional protocol/idle-upload questions.
- Feature enumeration comes from engine hash-map state, so insertion order should not be assumed. Summary output normalizes absent projects to default.
- Migration catches repository update errors as warning strings and forwards engine compilation warnings. Backup warning shapes differ from main. An awaited update sink can resolve after a rejected application because the repository catches and warns.

## Validation and limits

- Current main: production-only no-emit TypeScript check **passed**. No tests/examples ran.
- Current migration working tree: production-only compilation emits JavaScript and declarations with **zero diagnostics**. The emitted package entry point loads, selects an engine variant with payload, resolves caller fallbacks with both status fields, and destroys cleanly. These checks explicitly reject unscoped engine imports.
- Earlier alias checks established compatibility before the import wiring patch. The current SDK compiles and runs the focused package check without aliases or the obsolete evaluator imports.
- Focused type fixtures against those published declarations accepted structural strategies and flag-name augmentation, and rejected removed repository/bootstrapOverride/mode APIs and runtime Strategy construction. At the time of those fixture checks, the two old variant errors were excluded. They have since been removed, and production compilation now needs no exclusions beyond the intentionally omitted test suite.
- Published-engine runtime probes reproduced E1/E2/E3/E5/E6 and verified E4's fix, ordinary-object JSON state handling, custom parameters, and restored count values. Error suppression was inspected in the published JS wrapper and reproduced.
- Repository runtime probes used a temporary migration snapshot and an explicit test-only import alias to the scoped package. They confirmed ready-only bootstrap/no persistence, synchronization despite cache-write rejection, and post-stop update guards. Those earlier probes did not load the package root. The subsequent production build/package check described in B2 now verifies that path as well.
- On 2026-11-03, this review was updated with accepted decisions and README gained the startup/bootstrap contract. No runtime code or engine behavior changed in that documentation pass.
- During the original review no source or branch changes were made. The subsequent requested patches change the manifest and SDK imports, remove the obsolete variant evaluator, and update this review. No dependency installation, branch switch/merge, or engine modification was performed by the patch. Temporary check scripts were under /tmp.

## Suggested next steps

1. Published engine wiring and obsolete-evaluator cleanup are complete. Production compilation and the focused package entry-point check previously passed.
2. Verify a packed production build in a clean installation containing only declared dependencies; targeted checks already rejected unscoped engine resolution.
3. Retain E2 as a known bug needing an engine follow-up, explicitly accepted for now. E1/E3/E5/E6 need no compatibility patches under the accepted decisions.
4. Startup readiness, bootstrap non-persistence, and live-only change/synchronization notifications are now documented.
5. Original test preservation is complete; resolve or explicitly accept the hostname and impact-validation failures above. Examples and clean-install/packed-package verification remain. E2 is still an accepted engine bug.
