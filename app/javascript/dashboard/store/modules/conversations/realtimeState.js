/**
 * Lifecycle state for the authorized fetch of conversations that arrive over ActionCable but
 * are not yet in the store.
 *
 * This is deliberately plain module state rather than Vuex: it must survive queue, filter and
 * route changes, and pagination resets, so that switching queues can never lose a customer
 * message. It is reset only by lifecycle code (account switch, logout, teardown).
 *
 * There is no negative cache of refusals and no conversation-level eviction.
 */

export const DEBOUNCE_MS = 300;
export const MAX_CONCURRENT = 4;
export const MESSAGE_BUFFER_LIMIT = 50;

/**
 * The only key shape used anywhere. display_id is unique per account, and ApiClient resolves
 * the account from window.location, so a key without the account is ambiguous during a switch.
 */
export const realtimeKey = (accountId, conversationId) =>
  `${accountId}:${conversationId}`;

const inflight = new Map();
const queue = [];
let running = 0;
let accountGeneration = 0;
let tokenCounter = 0;

export const inflightFetches = inflight;
export const getAccountGeneration = () => accountGeneration;
export const getRunningCount = () => running;
export const getQueueLength = () => queue.length;

export const createInflightEntry = accountId => {
  tokenCounter += 1;
  return {
    accountId,
    accountGeneration,
    token: tokenCounter,
    messageBuffer: new Map(),
    conversationPayload: null,
    state: 'debouncing',
    cancelled: false,
    timer: null,
    runner: null,
    promise: null,
  };
};

/**
 * Buffers a message against an entry, keyed by identity so duplicate cable events do not
 * consume buffer budget. Oldest entries are dropped first once the cap is reached.
 */
export const bufferMessage = (entry, message) => {
  const identity = message?.id ?? message?.echo_id;
  if (identity === undefined || identity === null) return;
  // Re-inserting moves the identity to the end, keeping insertion order meaningful.
  entry.messageBuffer.delete(identity);
  entry.messageBuffer.set(identity, message);
  while (entry.messageBuffer.size > MESSAGE_BUFFER_LIMIT) {
    const oldest = entry.messageBuffer.keys().next().value;
    entry.messageBuffer.delete(oldest);
  }
};

/** Keeps the conversation payload with the newest updated_at. */
export const bufferConversationPayload = (entry, payload) => {
  if (!payload) return;
  const current = entry.conversationPayload;
  if (
    !current ||
    Number(payload.updated_at ?? 0) >= Number(current.updated_at ?? 0)
  ) {
    entry.conversationPayload = payload;
  }
};

function startNext() {
  while (running < MAX_CONCURRENT && queue.length > 0) {
    const entry = queue.shift();
    if (!entry.cancelled) {
      // eslint-disable-next-line no-use-before-define
      runEntry(entry);
    }
  }
}

function runEntry(entry) {
  entry.state = 'running';
  running += 1;
  const settle = () => {
    running = Math.max(0, running - 1);
    startNext();
  };
  entry.promise = Promise.resolve()
    .then(() => entry.runner())
    .then(settle, settle);
  return entry.promise;
}

/**
 * The single place an unknown-conversation request is started.
 *
 * Trailing debounce per conversation: a burst of events for one conversation collapses into
 * one request. Once the timer fires the entry is queued FIFO behind a global concurrency cap.
 * Events arriving while an entry is queued or running merge into that entry instead of
 * scheduling anything new.
 */
export const scheduleFetch = (key, entry, runner) => {
  entry.runner = runner;
  if (entry.state === 'queued' || entry.state === 'running') return;

  if (entry.timer) clearTimeout(entry.timer);
  entry.state = 'debouncing';
  entry.timer = setTimeout(() => {
    entry.timer = null;
    entry.state = 'queued';
    queue.push(entry);
    startNext();
  }, DEBOUNCE_MS);
};

/**
 * Lifecycle reset: account switch, logout, teardown. Cancels pending debounce timers, drops
 * queued work before it starts, and bumps the generation so any response still in flight fails
 * its validity check and commits nothing.
 *
 * `running` is intentionally not reset - in-flight promises still decrement it when they settle.
 */
export const resetRealtimeState = () => {
  inflight.forEach(entry => {
    if (entry.timer) clearTimeout(entry.timer);
    entry.timer = null;
    entry.cancelled = true;
  });
  queue.length = 0;
  inflight.clear();
  accountGeneration += 1;
};
