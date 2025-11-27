export type FailEvent = NetworkEventError | HttpStatusError | ServerEvent;

type BaseFailEvent = { occurredAt: Date; message: string };

type NetworkEventError = BaseFailEvent & {
  type: 'network-error';
};

type HttpStatusError = BaseFailEvent & {
  statusCode: number;
  type: 'http-status-error';
};

type ServerEvent = BaseFailEvent & {
  event: string;
  type: 'server-hint';
};

const FAILOVER_SERVER_HINTS = ['polling'];

// explicitly including 429 here, this is used by Unleash to signal to the SDK
// that there's already too many streaming clients connected and it should switch to polling
const HARD_FAILOVER_STATUS_CODES = [401, 403, 404, 429, 501];
const SOFT_FAILOVER_STATUS_CODES = [408, 500, 502, 503, 504];

export class FailoverStrategy {
  private failures: FailEvent[] = [];

  constructor(
    private readonly maxFails: number,
    private readonly relaxTimeMs: number,
  ) {}

  shouldFailover(event: FailEvent, now: Date = new Date()): boolean {
    const nowMs = now.getTime();

    this.pruneOldFailures(nowMs);
    switch (event.type) {
      case 'http-status-error':
        return this.handleHttpStatus(event);

      case 'server-hint':
        return this.handleServerEvent(event);

      case 'network-error':
        return this.handleNetwork(event);
    }
  }

  private handleServerEvent(event: ServerEvent): boolean {
    if (FAILOVER_SERVER_HINTS.includes(event.event)) {
      return true;
    }

    // things like hard disconnects are triggered by rolling restarts or explicit
    // shutdown. We expect Unleash to come back after such events so we ignore the
    //  error here. If Unleash doesn't come back up, it'll be handled by the HTTP Status
    //  events at some point in the near future
    return false;
  }

  // Network shenanigans are basically always going to contribute to failover but
  // never an immediate failover decision. Kinda impossible to know if things will
  // get better sooo.. sliding window time!
  private handleNetwork(event: NetworkEventError): boolean {
    return this.hasTooManyFails(event);
  }

  private handleHttpStatus(event: HttpStatusError): boolean {
    if (HARD_FAILOVER_STATUS_CODES.includes(event.statusCode)) {
      return true;
    } else if (SOFT_FAILOVER_STATUS_CODES.includes(event.statusCode)) {
      return this.hasTooManyFails(event);
    }
    return false;
  }

  private hasTooManyFails(event: FailEvent): boolean {
    this.failures.push(event);
    return this.failures.length >= this.maxFails;
  }

  // Because SSE doesn't have a success event, we only prune on new failures.
  // So we use this to build ourselves a sliding window of recent failures.
  // Be cool if we didn't have to do this but I see no meaningful way
  // to get ourselves an error window otherwise.
  private pruneOldFailures(nowMs: number): void {
    const cutoff = nowMs - this.relaxTimeMs;
    let write = 0;
    for (let read = 0; read < this.failures.length; read++) {
      if (this.failures[read].occurredAt.getTime() >= cutoff) {
        this.failures[write++] = this.failures[read];
      }
    }
    this.failures.length = write;
  }
}
