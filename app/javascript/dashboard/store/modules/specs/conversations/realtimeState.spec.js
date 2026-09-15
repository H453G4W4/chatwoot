import { describe, it, beforeEach, afterEach, expect, vi } from 'vitest';
import { mutations } from '../../conversations';
import mutationTypes from '../../../mutation-types';
import {
  DEBOUNCE_MS,
  MAX_CONCURRENT,
  MESSAGE_BUFFER_LIMIT,
  bufferConversationPayload,
  bufferMessage,
  createInflightEntry,
  getAccountGeneration,
  getQueueLength,
  getRunningCount,
  inflightFetches,
  realtimeKey,
  resetRealtimeState,
  scheduleFetch,
} from '../../conversations/realtimeState';

// Resolves a runner only when the test says so, so concurrency can be observed mid-flight.
const deferred = () => {
  let resolve;
  const promise = new Promise(r => {
    resolve = r;
  });
  return { promise, resolve };
};

describe('realtimeState', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetRealtimeState();
  });

  afterEach(() => {
    resetRealtimeState();
    vi.useRealTimers();
  });

  describe('#realtimeKey', () => {
    it('always scopes the key by account', () => {
      expect(realtimeKey(7, 42)).toBe('7:42');
      expect(realtimeKey(8, 42)).not.toBe(realtimeKey(7, 42));
    });
  });

  describe('debounce', () => {
    it('collapses a burst for one conversation into exactly one request', async () => {
      const runner = vi.fn(() => Promise.resolve());
      const entry = createInflightEntry(1);
      inflightFetches.set(realtimeKey(1, 5), entry);

      for (let i = 0; i < 10; i += 1) {
        bufferMessage(entry, { id: 100 + i, created_at: i });
        scheduleFetch(realtimeKey(1, 5), entry, runner);
      }
      expect(runner).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
      expect(runner).toHaveBeenCalledTimes(1);
      expect(entry.messageBuffer.size).toBe(10);
    });

    it('restarts the timer on every further event during the debounce window', async () => {
      const runner = vi.fn(() => Promise.resolve());
      const entry = createInflightEntry(1);
      inflightFetches.set(realtimeKey(1, 6), entry);

      scheduleFetch(realtimeKey(1, 6), entry, runner);
      await vi.advanceTimersByTimeAsync(DEBOUNCE_MS - 50);
      scheduleFetch(realtimeKey(1, 6), entry, runner);
      await vi.advanceTimersByTimeAsync(DEBOUNCE_MS - 50);
      expect(runner).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(50);
      expect(runner).toHaveBeenCalledTimes(1);
    });
  });

  describe('concurrency', () => {
    it('never runs more than MAX_CONCURRENT requests and drains the rest FIFO', async () => {
      const gates = [];
      const started = [];
      const entries = [];

      for (let i = 0; i < 10; i += 1) {
        const gate = deferred();
        gates.push(gate);
        const entry = createInflightEntry(1);
        entries.push(entry);
        inflightFetches.set(realtimeKey(1, i), entry);
        scheduleFetch(realtimeKey(1, i), entry, () => {
          started.push(i);
          return gate.promise;
        });
      }

      await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
      expect(started).toHaveLength(MAX_CONCURRENT);
      expect(getRunningCount()).toBe(MAX_CONCURRENT);
      expect(getQueueLength()).toBe(10 - MAX_CONCURRENT);
      expect(started).toEqual([0, 1, 2, 3]);

      gates[0].resolve();
      await vi.advanceTimersByTimeAsync(0);
      // one slot freed, the next queued entry starts, still capped
      expect(started).toEqual([0, 1, 2, 3, 4]);
      expect(getRunningCount()).toBe(MAX_CONCURRENT);

      gates.slice(1).forEach(g => g.resolve());
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(0);
      expect(started).toHaveLength(10);
      expect(getQueueLength()).toBe(0);
    });
  });

  describe('#resetRealtimeState', () => {
    it('cancels pending debounce timers so queued work never starts', async () => {
      const runner = vi.fn(() => Promise.resolve());
      const entry = createInflightEntry(1);
      inflightFetches.set(realtimeKey(1, 5), entry);
      scheduleFetch(realtimeKey(1, 5), entry, runner);

      resetRealtimeState();
      await vi.advanceTimersByTimeAsync(DEBOUNCE_MS * 2);

      expect(runner).not.toHaveBeenCalled();
      expect(inflightFetches.size).toBe(0);
    });

    it('drops queued entries before they start', async () => {
      const gates = [];
      const started = [];
      for (let i = 0; i < 10; i += 1) {
        const gate = deferred();
        gates.push(gate);
        const entry = createInflightEntry(1);
        inflightFetches.set(realtimeKey(1, i), entry);
        scheduleFetch(realtimeKey(1, i), entry, () => {
          started.push(i);
          return gate.promise;
        });
      }
      await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
      expect(started).toHaveLength(MAX_CONCURRENT);

      resetRealtimeState();
      expect(getQueueLength()).toBe(0);

      gates.forEach(g => g.resolve());
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(0);
      // the six queued entries never ran for the stale account
      expect(started).toHaveLength(MAX_CONCURRENT);
    });

    it('never lets the running counter go negative or exceed the cap after a reset', async () => {
      const gates = [];
      for (let i = 0; i < MAX_CONCURRENT; i += 1) {
        const gate = deferred();
        gates.push(gate);
        const entry = createInflightEntry(1);
        inflightFetches.set(realtimeKey(1, i), entry);
        scheduleFetch(realtimeKey(1, i), entry, () => gate.promise);
      }
      await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
      expect(getRunningCount()).toBe(MAX_CONCURRENT);

      // account switch while all four are still in flight
      resetRealtimeState();
      const newEntry = createInflightEntry(2);
      inflightFetches.set(realtimeKey(2, 99), newEntry);
      const newRunner = vi.fn(() => Promise.resolve());
      scheduleFetch(realtimeKey(2, 99), newEntry, newRunner);
      await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);

      // the old in-flight requests still hold their slots, so the new account is delayed
      expect(newRunner).not.toHaveBeenCalled();
      expect(getRunningCount()).toBe(MAX_CONCURRENT);

      gates.forEach(g => g.resolve());
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(0);

      // slots are released exactly once each; the new account then runs
      expect(newRunner).toHaveBeenCalledTimes(1);
      expect(getRunningCount()).toBeGreaterThanOrEqual(0);
      expect(getRunningCount()).toBeLessThanOrEqual(MAX_CONCURRENT);
    });

    it('invalidates a response that is still in flight', async () => {
      const entry = createInflightEntry(1);
      const generationAtStart = entry.accountGeneration;
      inflightFetches.set(realtimeKey(1, 5), entry);

      resetRealtimeState();

      // the validity check the action performs on apply
      expect(inflightFetches.get(realtimeKey(1, 5))).toBeUndefined();
      expect(generationAtStart === getAccountGeneration()).toBe(false);
    });
  });

  describe('#bufferMessage', () => {
    it('caps the buffer and drops the oldest entries first', () => {
      const entry = createInflightEntry(1);
      for (let i = 0; i < MESSAGE_BUFFER_LIMIT + 10; i += 1) {
        bufferMessage(entry, { id: i, created_at: i });
      }
      expect(entry.messageBuffer.size).toBe(MESSAGE_BUFFER_LIMIT);
      expect(entry.messageBuffer.has(0)).toBe(false);
      expect(entry.messageBuffer.has(MESSAGE_BUFFER_LIMIT + 9)).toBe(true);
    });

    it('does not let a duplicate cable event consume buffer budget', () => {
      const entry = createInflightEntry(1);
      bufferMessage(entry, { id: 1, content: 'a' });
      bufferMessage(entry, { id: 1, content: 'updated' });
      expect(entry.messageBuffer.size).toBe(1);
      expect(entry.messageBuffer.get(1).content).toBe('updated');
    });
  });

  describe('#bufferConversationPayload', () => {
    it('keeps the payload with the newest updated_at', () => {
      const entry = createInflightEntry(1);
      bufferConversationPayload(entry, { id: 1, updated_at: 500 });
      bufferConversationPayload(entry, { id: 1, updated_at: 100 });
      expect(entry.conversationPayload.updated_at).toBe(500);
      bufferConversationPayload(entry, { id: 1, updated_at: 900 });
      expect(entry.conversationPayload.updated_at).toBe(900);
    });
  });
});

describe('realtimeState is not touched by ordinary list lifecycle', () => {
  beforeEach(() => {
    resetRealtimeState();
  });
  afterEach(() => {
    resetRealtimeState();
  });

  it('EMPTY_ALL_CONVERSATION does not reset the realtime lifecycle', () => {
    const entry = createInflightEntry(1);
    inflightFetches.set(realtimeKey(1, 5), entry);
    const generationBefore = getAccountGeneration();

    const state = {
      allConversations: [{ id: 5 }],
      selectedChatId: 5,
      listGeneration: 0,
    };
    mutations[mutationTypes.EMPTY_ALL_CONVERSATION](state);

    // the list generation moves, the realtime lifecycle does not: a queue, filter, route or
    // pagination reset must never drop a buffered customer message
    expect(state.listGeneration).toBe(1);
    expect(getAccountGeneration()).toBe(generationBefore);
    expect(inflightFetches.get(realtimeKey(1, 5))).toBe(entry);
    expect(entry.cancelled).toBe(false);
  });
});
