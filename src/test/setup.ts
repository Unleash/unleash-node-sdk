// Shared test setup for Ava.
// Suppress noisy background fetches that hit Nock after tests complete.
process.setMaxListeners(50);

const shouldIgnore = (err: any) => {
  if (!err) return false;
  return (
    err.code === 'ERR_NOCK_NO_MATCH' ||
    err.code === 'ENOTFOUND' ||
    (typeof err.message === 'string' && err.message.includes('Nock: No match')) ||
    (typeof err.message === 'string' &&
      (err.message.includes('EAI_AGAIN') || err.message.includes('ENOTFOUND')))
  );
};

process.on('unhandledRejection', (reason: any, promise) => {
  if (!shouldIgnore(reason)) {
    // eslint-disable-next-line no-console
    console.error(reason);
  }
  if (promise && typeof promise.catch === 'function') {
    promise.catch(() => {});
  }
});

process.on('uncaughtException', (err: any) => {
  if (!shouldIgnore(err)) {
    // eslint-disable-next-line no-console
    console.error(err);
  }
});
