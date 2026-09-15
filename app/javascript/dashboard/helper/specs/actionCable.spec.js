import { describe, it, beforeEach, afterEach, expect, vi } from 'vitest';
import ActionCableConnector from '../actionCable';
import AuthAPI from '../../api/auth';
import DashboardAudioNotificationHelper from '../AudioAlerts/DashboardAudioNotificationHelper';
import { emitter } from 'shared/helpers/mitt';
import { BUS_EVENTS } from 'shared/constants/busEvents';
import { resetRealtimeState } from 'dashboard/store/modules/conversations/realtimeState';
import { FEATURE_FLAGS } from 'dashboard/featureFlags';

vi.mock('shared/helpers/mitt', () => ({
  emitter: {
    emit: vi.fn(),
  },
}));

vi.mock('../../api/auth', () => ({ default: { logout: vi.fn() } }));

vi.mock('dashboard/store/modules/conversations/realtimeState', () => ({
  resetRealtimeState: vi.fn(),
}));

// The audio alert helper reads account/route state this spec does not build. Isolating it
// from the handler is Phase 2D work; here it is stubbed so routing can be asserted.
vi.mock('../AudioAlerts/DashboardAudioNotificationHelper', () => ({
  default: { onNewMessage: vi.fn() },
}));

vi.mock('dashboard/composables/useImpersonation', () => ({
  useImpersonation: () => ({
    isImpersonating: { value: false },
  }),
}));

global.chatwootConfig = {
  websocketURL: 'wss://test.chatwoot.com',
};

const mockRetryJitter = value =>
  vi.spyOn(Math, 'random').mockReturnValue(value);

describe('ActionCableConnector - Copilot Tests', () => {
  let store;
  let actionCable;
  let mockDispatch;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDispatch = vi.fn();
    store = {
      $store: {
        dispatch: mockDispatch,
        getters: {
          getCurrentAccountId: 1,
          'accounts/isFeatureEnabledonAccount': vi.fn(() => true),
        },
      },
    };

    actionCable = ActionCableConnector.init(store.$store, 'test-token');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllTimers();
    vi.useRealTimers();
  });
  describe('copilot event handlers', () => {
    it('should register the copilot.message.created event handler', () => {
      expect(Object.keys(actionCable.events)).toContain(
        'copilot.message.created'
      );
      expect(actionCable.events['copilot.message.created']).toBe(
        actionCable.onCopilotMessageCreated
      );
    });

    it('should handle the copilot.message.created event through the ActionCable system', () => {
      const copilotData = {
        id: 2,
        content: 'This is a copilot message from ActionCable',
        conversation_id: 456,
        created_at: '2025-05-27T15:58:04-06:00',
        account_id: 1,
      };
      actionCable.onReceived({
        event: 'copilot.message.created',
        data: copilotData,
      });
      expect(mockDispatch).toHaveBeenCalledWith(
        'copilotMessages/upsert',
        copilotData
      );
    });
  });

  describe('conversation unread count event handlers', () => {
    it('should register the conversation.unread_count_changed event handler', () => {
      expect(Object.keys(actionCable.events)).toContain(
        'conversation.unread_count_changed'
      );
      expect(actionCable.events['conversation.unread_count_changed']).toBe(
        actionCable.onConversationUnreadCountChanged
      );
    });

    it('should refetch unread counts when unread count changes', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
      mockRetryJitter(0.5);

      actionCable.onReceived({
        event: 'conversation.unread_count_changed',
        data: { account_id: 1 },
      });

      expect(mockDispatch).toHaveBeenCalledWith('conversationUnreadCounts/get');

      vi.advanceTimersByTime(37499);
      expect(mockDispatch).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(1);
      expect(mockDispatch).toHaveBeenCalledTimes(2);
      expect(mockDispatch).toHaveBeenLastCalledWith(
        'conversationUnreadCounts/get'
      );
    });

    it('does not retry unread count changes when filtered counts are disabled', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
      store.$store.getters[
        'accounts/isFeatureEnabledonAccount'
      ].mockImplementation(
        (_, featureFlag) =>
          featureFlag === FEATURE_FLAGS.CONVERSATION_UNREAD_COUNTS
      );

      actionCable.onReceived({
        event: 'conversation.unread_count_changed',
        data: { account_id: 1 },
      });

      expect(mockDispatch).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(45000);
      expect(mockDispatch).toHaveBeenCalledTimes(1);
    });

    it('delays unread count refetch when a conversation is mentioned', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));

      const conversation = { id: 1, account_id: 1 };

      actionCable.onReceived({
        event: 'conversation.mentioned',
        data: conversation,
      });

      expect(mockDispatch).toHaveBeenCalledWith('addMentions', conversation);
      expect(mockDispatch).not.toHaveBeenCalledWith(
        'conversationUnreadCounts/get'
      );

      vi.advanceTimersByTime(4999);
      expect(mockDispatch).not.toHaveBeenCalledWith(
        'conversationUnreadCounts/get'
      );

      vi.advanceTimersByTime(1);
      expect(mockDispatch).toHaveBeenCalledWith('conversationUnreadCounts/get');
    });

    it('does not schedule mention unread count fetches when filtered counts are disabled', () => {
      vi.useFakeTimers();
      store.$store.getters[
        'accounts/isFeatureEnabledonAccount'
      ].mockImplementation(
        (_, featureFlag) =>
          featureFlag === FEATURE_FLAGS.CONVERSATION_UNREAD_COUNTS
      );

      const conversation = { id: 1, account_id: 1 };

      actionCable.onReceived({
        event: 'conversation.mentioned',
        data: conversation,
      });

      expect(mockDispatch).toHaveBeenCalledWith('addMentions', conversation);

      vi.advanceTimersByTime(45000);
      expect(mockDispatch).not.toHaveBeenCalledWith(
        'conversationUnreadCounts/get'
      );
    });

    it('retries mentioned unread counts after the backend refresh window', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
      mockRetryJitter(0.5);

      actionCable.onReceived({
        event: 'conversation.mentioned',
        data: { id: 1, account_id: 1 },
      });

      const unreadCountFetches = () =>
        mockDispatch.mock.calls.filter(
          ([action]) => action === 'conversationUnreadCounts/get'
        );

      vi.advanceTimersByTime(5000);
      expect(unreadCountFetches()).toHaveLength(1);

      vi.advanceTimersByTime(32499);
      expect(unreadCountFetches()).toHaveLength(1);

      vi.advanceTimersByTime(1);
      expect(unreadCountFetches()).toHaveLength(2);
    });

    it('reschedules mentioned unread count retries for later invalidations', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
      mockRetryJitter(0);

      const unreadCountFetches = () =>
        mockDispatch.mock.calls.filter(
          ([action]) => action === 'conversationUnreadCounts/get'
        );

      actionCable.onReceived({
        event: 'conversation.mentioned',
        data: { id: 1, account_id: 1 },
      });

      vi.advanceTimersByTime(5000);
      expect(unreadCountFetches()).toHaveLength(1);

      vi.advanceTimersByTime(10000);
      actionCable.onReceived({
        event: 'conversation.mentioned',
        data: { id: 1, account_id: 1 },
      });

      vi.advanceTimersByTime(5000);
      expect(unreadCountFetches()).toHaveLength(2);

      vi.advanceTimersByTime(10000);
      expect(unreadCountFetches()).toHaveLength(2);

      vi.advanceTimersByTime(15000);
      expect(unreadCountFetches()).toHaveLength(3);
    });

    it('refetches filtered unread counts after account cache invalidation', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
      mockRetryJitter(0.5);

      const cacheKeys = {
        label: 'label-key',
        inbox: 'inbox-key',
        team: 'team-key',
      };
      const unreadCountFetches = () =>
        mockDispatch.mock.calls.filter(
          ([action]) => action === 'conversationUnreadCounts/get'
        );

      actionCable.onReceived({
        event: 'account.cache_invalidated',
        data: { account_id: 1, cache_keys: cacheKeys },
      });

      expect(mockDispatch).toHaveBeenCalledWith('labels/revalidate', {
        newKey: cacheKeys.label,
      });
      expect(mockDispatch).toHaveBeenCalledWith('inboxes/revalidate', {
        newKey: cacheKeys.inbox,
      });
      expect(mockDispatch).toHaveBeenCalledWith('teams/revalidate', {
        newKey: cacheKeys.team,
      });
      expect(unreadCountFetches()).toHaveLength(1);

      vi.advanceTimersByTime(37499);
      expect(unreadCountFetches()).toHaveLength(1);

      vi.advanceTimersByTime(1);
      expect(unreadCountFetches()).toHaveLength(2);
    });

    it('does not refetch unread counts after cache invalidation when filtered counts are disabled', () => {
      vi.useFakeTimers();
      store.$store.getters[
        'accounts/isFeatureEnabledonAccount'
      ].mockImplementation(
        (_, featureFlag) =>
          featureFlag === FEATURE_FLAGS.CONVERSATION_UNREAD_COUNTS
      );

      actionCable.onReceived({
        event: 'account.cache_invalidated',
        data: {
          account_id: 1,
          cache_keys: {
            label: 'label-key',
            inbox: 'inbox-key',
            team: 'team-key',
          },
        },
      });

      expect(mockDispatch).not.toHaveBeenCalledWith(
        'conversationUnreadCounts/get'
      );

      vi.advanceTimersByTime(45000);
      expect(mockDispatch).not.toHaveBeenCalledWith(
        'conversationUnreadCounts/get'
      );
    });

    it('does not refetch unread counts when unread count feature is disabled', () => {
      store.$store.getters[
        'accounts/isFeatureEnabledonAccount'
      ].mockReturnValue(false);

      actionCable.onReceived({
        event: 'conversation.unread_count_changed',
        data: { account_id: 1 },
      });

      expect(mockDispatch).not.toHaveBeenCalledWith(
        'conversationUnreadCounts/get'
      );
    });

    it('should throttle unread count refetches for repeated events', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));

      actionCable.onReceived({
        event: 'conversation.unread_count_changed',
        data: { account_id: 1 },
      });
      actionCable.onReceived({
        event: 'conversation.unread_count_changed',
        data: { account_id: 1 },
      });
      actionCable.onReceived({
        event: 'conversation.unread_count_changed',
        data: { account_id: 1 },
      });

      expect(mockDispatch).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(4999);
      expect(mockDispatch).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(1);
      expect(mockDispatch).toHaveBeenCalledTimes(2);
      expect(mockDispatch).toHaveBeenLastCalledWith(
        'conversationUnreadCounts/get'
      );
    });

    it('clears pending unread count refetch before immediate refetch', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));

      actionCable.onReceived({
        event: 'conversation.unread_count_changed',
        data: { account_id: 1 },
      });

      vi.advanceTimersByTime(1000);
      actionCable.onReceived({
        event: 'conversation.unread_count_changed',
        data: { account_id: 1 },
      });

      vi.setSystemTime(new Date('2026-01-01T00:00:06Z'));
      actionCable.onReceived({
        event: 'conversation.unread_count_changed',
        data: { account_id: 1 },
      });

      expect(mockDispatch).toHaveBeenCalledTimes(2);

      vi.advanceTimersByTime(4000);
      expect(mockDispatch).toHaveBeenCalledTimes(2);
    });
  });
});

describe('ActionCableConnector - unknown conversation authorization routing', () => {
  let mockDispatch;
  let connector;
  let present;

  const buildConnector = () => {
    mockDispatch = vi.fn();
    present = null;
    const $store = {
      dispatch: mockDispatch,
      getters: {
        getCurrentAccountId: 1,
        getConversationById: () => present,
        'accounts/isFeatureEnabledonAccount': vi.fn(() => true),
      },
    };
    return ActionCableConnector.init($store, 'test-token');
  };

  beforeEach(() => {
    vi.clearAllMocks();
    connector = buildConnector();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const dispatched = name => mockDispatch.mock.calls.filter(c => c[0] === name);

  describe('message.created', () => {
    it('takes the ordinary update path when the conversation is loaded', () => {
      present = { id: 5 };
      connector.onMessageCreated({
        conversation_id: 5,
        id: 1,
        conversation: { last_activity_at: 1200 },
      });
      expect(dispatched('addMessage')).toHaveLength(1);
      expect(dispatched('updateConversationLastActivity')).toHaveLength(1);
      expect(dispatched('ensureAuthorizedConversation')).toHaveLength(0);
    });

    it('routes an unloaded conversation through the authorized fetch', () => {
      present = null;
      connector.onMessageCreated({
        conversation_id: 5,
        id: 1,
        conversation: { last_activity_at: 1200 },
      });
      expect(dispatched('ensureAuthorizedConversation')).toHaveLength(1);
      expect(dispatched('addMessage')).toHaveLength(0);
    });

    it('does not throw when the payload has no nested conversation object', () => {
      present = null;
      expect(() =>
        connector.onMessageCreated({ conversation_id: 5, id: 1 })
      ).not.toThrow();
      expect(dispatched('ensureAuthorizedConversation')).toHaveLength(1);
    });
  });

  describe('message.updated', () => {
    it('updates the message and buffers it, but never starts a fetch', () => {
      present = null;
      connector.onMessageUpdated({ conversation_id: 5, id: 1 });
      expect(dispatched('updateMessage')).toHaveLength(1);
      expect(dispatched('bufferMessageUpdateIfFetching')).toHaveLength(1);
      expect(dispatched('ensureAuthorizedConversation')).toHaveLength(0);
    });
  });

  describe('conversation-level events', () => {
    const payload = { id: 5, updated_at: 10 };

    it.each([
      ['onConversationCreated'],
      ['onConversationUpdated'],
      ['onStatusChange'],
      ['onAssigneeChanged'],
      ['onConversationRead'],
      ['onConversationContactChange'],
    ])(
      '%s authorizes an absent conversation instead of inserting it',
      handler => {
        present = null;
        connector[handler]({ ...payload, meta: { sender: { id: 1 } } });
        expect(dispatched('ensureAuthorizedConversation')).toHaveLength(1);
        expect(dispatched('ensureAuthorizedConversation')[0][1]).toEqual({
          conversationId: 5,
          conversationPayload: expect.objectContaining({ id: 5 }),
        });
      }
    );

    it.each([
      ['onConversationCreated'],
      ['onConversationUpdated'],
      ['onStatusChange'],
      ['onAssigneeChanged'],
      ['onConversationRead'],
    ])('%s updates normally when the conversation is loaded', handler => {
      present = { id: 5 };
      connector[handler](payload);
      expect(dispatched('updateConversation')).toHaveLength(1);
      expect(dispatched('ensureAuthorizedConversation')).toHaveLength(0);
    });
  });

  describe('audio alert isolation', () => {
    it('still processes the message when the audio helper throws', () => {
      DashboardAudioNotificationHelper.onNewMessage.mockImplementationOnce(
        () => {
          throw new Error('audio device unavailable');
        }
      );
      present = { id: 5 };

      expect(() =>
        connector.onMessageCreated({
          conversation_id: 5,
          id: 1,
          conversation: { last_activity_at: 1200 },
        })
      ).not.toThrow();

      // the reorder and the store dispatches must survive an alert failure
      expect(dispatched('addMessage')).toHaveLength(1);
      expect(dispatched('updateConversationLastActivity')).toHaveLength(1);
    });

    it('still authorizes an unknown conversation when the audio helper throws', () => {
      DashboardAudioNotificationHelper.onNewMessage.mockImplementationOnce(
        () => {
          throw new Error('audio device unavailable');
        }
      );
      present = null;

      expect(() =>
        connector.onMessageCreated({ conversation_id: 7, id: 2 })
      ).not.toThrow();

      expect(dispatched('ensureAuthorizedConversation')).toHaveLength(1);
    });
  });

  describe('security invariant', () => {
    it('never consults a role, so no role can shortcut the authorized fetch', () => {
      // The handlers receive only the cable payload and the presence of the conversation in
      // the store; there is no role, permission or inbox-membership input to branch on.
      present = null;
      connector.onConversationCreated({ id: 5 });
      connector.onMessageCreated({ conversation_id: 6, id: 1 });

      expect(dispatched('ensureAuthorizedConversation')).toHaveLength(2);
      // no mutation-level insertion is ever dispatched from a cable payload
      expect(dispatched('addConversation')).toHaveLength(0);
      expect(dispatched('upsertFetchedConversation')).toHaveLength(0);
    });
  });
});

describe('ActionCableConnector - logout lifecycle', () => {
  let connector;

  beforeEach(() => {
    vi.clearAllMocks();
    connector = ActionCableConnector.init(
      {
        dispatch: vi.fn(),
        getters: {
          getCurrentAccountId: 1,
          getConversationById: () => null,
          'accounts/isFeatureEnabledonAccount': vi.fn(() => true),
        },
      },
      'test-token'
    );
  });

  it('resets realtime state before ending the session', () => {
    const order = [];
    resetRealtimeState.mockImplementation(() => order.push('reset'));
    AuthAPI.logout.mockImplementation(() => order.push('logout'));

    connector.onLogout();

    expect(order).toEqual(['reset', 'logout']);
  });

  it('registers onLogout for the user:logout event', () => {
    expect(connector.events['user:logout']).toBe(connector.onLogout);
  });
});

describe('ActionCableConnector - teardown is not a network loss', () => {
  let connector;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    connector = ActionCableConnector.init(
      {
        dispatch: vi.fn(),
        getters: {
          getCurrentAccountId: 1,
          getConversationById: () => null,
          'accounts/isFeatureEnabledonAccount': vi.fn(() => true),
        },
      },
      'test-token'
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not raise the offline banner when the socket closes after a teardown', () => {
    connector.disconnect();
    emitter.emit.mockClear();

    // the websocket close is async, so the base class fires this afterwards
    connector.onDisconnected();

    expect(emitter.emit).not.toHaveBeenCalledWith(
      BUS_EVENTS.WEBSOCKET_DISCONNECT
    );
  });

  it('still raises the offline banner for a genuine network loss', () => {
    emitter.emit.mockClear();

    connector.onDisconnected();

    expect(emitter.emit).toHaveBeenCalledWith(BUS_EVENTS.WEBSOCKET_DISCONNECT);
  });

  it('stops the reconnect poll instead of re-arming it forever', () => {
    connector.disconnect();
    const clearSpy = vi.spyOn(connector, 'clearReconnectTimer');

    // the base class arms this from its disconnected callback; the timer must not re-arm
    connector.initReconnectTimer();
    vi.advanceTimersByTime(5000);

    expect(clearSpy).toHaveBeenCalled();
    expect(connector.reconnectTimer).toBeNull();
  });

  it('clears its own timers so the previous account cannot keep dispatching', () => {
    connector.unreadCountsFetchTimer = setTimeout(() => {}, 100000);
    connector.mentionUnreadCountsFetchTimer = setTimeout(() => {}, 100000);
    connector.mentionUnreadCountsRetryTimer = setTimeout(() => {}, 100000);
    connector.filteredUnreadCountsRetryTimer = setTimeout(() => {}, 100000);
    connector.CancelTyping[42] = setTimeout(() => {}, 100000);

    connector.disconnect();

    expect(connector.unreadCountsFetchTimer).toBeNull();
    expect(connector.mentionUnreadCountsFetchTimer).toBeNull();
    expect(connector.mentionUnreadCountsRetryTimer).toBeNull();
    expect(connector.filteredUnreadCountsRetryTimer).toBeNull();
    expect(connector.CancelTyping).toEqual([]);
    // Exactly one timer survives: BaseActionCableConnector's 20s presence chain, which its
    // disconnect() has never cleared. That is a pre-existing upstream leak in shared widget
    // code and is deliberately out of scope for this phase - asserted here so the residual is
    // documented and any future change to it fails loudly.
    expect(vi.getTimerCount()).toBe(1);
  });
});
