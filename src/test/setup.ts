// Suppress noisy background fetches that hit Nock after tests complete. Ava used to swallow these.
process.setMaxListeners(50);

const shouldIgnore = (err: any) => {
  if (!err) return false;
  return (
    err.code === 'ERR_NOCK_NO_MATCH' ||
    err.code === 'ENOTFOUND' ||
    (typeof err.message === 'string' &&
      (err.message.includes('EAI_AGAIN') || err.message.includes('ENOTFOUND')))
  );
};

process.on('unhandledRejection', (reason: any) => {
  if (shouldIgnore(reason)) {
    return;
  }
  throw reason;
});

process.on('uncaughtException', (err: any) => {
  if (shouldIgnore(err)) {
    return;
  }
  throw err;
});

// Vitest coverage provider expects minimatch.minimatch; older minimatch only exports the function.
// Patch once so both lint (minimatch v3) and coverage consumers can coexist.
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
  const mm = require('minimatch');
  if (typeof mm === 'function' && !mm.minimatch) {
    // eslint-disable-next-line no-param-reassign
    mm.minimatch = mm;
  }
} catch {
  // ignore if minimatch is unavailable
}
