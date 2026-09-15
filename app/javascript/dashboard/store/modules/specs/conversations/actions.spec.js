import axios from 'axios';
import actions, {
  hasMessageFailedWithExternalError,
} from '../../conversations/actions';
import types from '../../../mutation-types';
const dataToSend = {
  payload: [
    {
      attribute_key: 'status',
      filter_operator: 'equal_to',
      values: ['open'],
      query_operator: null,
    },
  ],
};
import { dataReceived } from './testConversationResponse';
import conversationPage from '../../conversationPage';
import {
  inflightFetches,
  realtimeKey,
  resetRealtimeState,
  DEBOUNCE_MS,
} from '../../conversations/realtimeState';

const commit = vi.fn();
const dispatch = vi.fn();
global.axios = axios;
vi.mock('axios');

describe('#hasMessageFailedWithExternalError', () => {
  it('returns false if message is sent', () => {
    const pendingMessage = {
      status: 'sent',
      content_attributes: {},
    };
    expect(hasMessageFailedWithExternalError(pendingMessage)).toBe(false);
  });
  it('returns false if status is not failed', () => {
    const pendingMessage = {
      status: 'progress',
      content_attributes: {},
    };
    expect(hasMessageFailedWithExternalError(pendingMessage)).toBe(false);
  });

  it('returns false if status is failed but no external error', () => {
    const pendingMessage = {
      status: 'failed',
      content_attributes: {},
    };
    expect(hasMessageFailedWithExternalError(pendingMessage)).toBe(false);
  });

  it('returns true if status is failed and has external error', () => {
    const pendingMessage = {
      status: 'failed',
      content_attributes: {
        external_error: 'error',
      },
    };
    expect(hasMessageFailedWithExternalError(pendingMessage)).toBe(true);
  });
});

describe('#actions', () => {
  describe('#getConversation', () => {
    it('sends correct actions if API is success', async () => {
      axios.get.mockResolvedValue({
        data: { id: 1, meta: { sender: { id: 1, name: 'Contact 1' } } },
      });
      const localDispatch = vi.fn();
      await actions.getConversation({ commit, dispatch: localDispatch }, 1);
      // Deep links insert through the same authorized upsert helper as the realtime path.
      expect(localDispatch.mock.calls).toEqual([
        [
          'upsertFetchedConversation',
          { id: 1, meta: { sender: { id: 1, name: 'Contact 1' } } },
        ],
      ]);
    });
    it('sends correct actions if API is error', async () => {
      axios.get.mockRejectedValue({ message: 'Incorrect header' });
      const localDispatch = vi.fn();
      await actions.getConversation({ commit, dispatch: localDispatch });
      expect(localDispatch.mock.calls).toEqual([]);
    });
  });
  describe('#muteConversation', () => {
    it('sends correct actions if API is success', async () => {
      axios.get.mockResolvedValue(null);
      await actions.muteConversation({ commit }, 1);
      expect(commit.mock.calls).toEqual([[types.MUTE_CONVERSATION]]);
    });
    it('sends correct actions if API is error', async () => {
      axios.get.mockRejectedValue({ message: 'Incorrect header' });
      await actions.getConversation({ commit });
      expect(commit.mock.calls).toEqual([]);
    });
  });

  describe('#updateConversation', () => {
    it('sends setContact action and update_conversation mutation', () => {
      const conversation = {
        id: 1,
        messages: [],
        meta: { sender: { id: 1, name: 'john-doe' } },
        labels: ['support'],
      };
      actions.updateConversation(
        { commit, rootState: { route: { name: 'home' } }, dispatch },
        conversation
      );
      expect(commit.mock.calls).toEqual([
        [types.UPDATE_CONVERSATION, conversation],
      ]);
      expect(dispatch.mock.calls).toEqual([
        [
          'conversationLabels/setConversationLabel',
          { id: 1, data: ['support'] },
        ],
        [
          'contacts/setContact',
          {
            id: 1,
            name: 'john-doe',
          },
        ],
      ]);
    });
  });

  describe('#addMessage', () => {
    it('sends correct mutations if message is incoming', () => {
      const message = {
        id: 1,
        message_type: 0,
        conversation_id: 1,
      };
      actions.addMessage({ commit }, message);
      expect(commit.mock.calls).toEqual([
        [types.ADD_MESSAGE, message],
        [
          types.SET_CONVERSATION_CAN_REPLY,
          { conversationId: 1, canReply: true },
        ],
        [types.ADD_CONVERSATION_ATTACHMENTS, message],
      ]);
    });
    it('sends correct mutations if message is not an incoming message', () => {
      const message = {
        id: 1,
        message_type: 1,
        conversation_id: 1,
      };
      actions.addMessage({ commit }, message);
      expect(commit.mock.calls).toEqual([[types.ADD_MESSAGE, message]]);
    });
  });

  describe('#markMessagesRead', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    it('sends correct mutations if api is successful', async () => {
      const lastSeen = new Date().getTime() / 1000;
      axios.post.mockResolvedValue({
        data: { id: 1, agent_last_seen_at: lastSeen },
      });
      await actions.markMessagesRead({ commit }, { id: 1 });
      vi.runAllTimers();
      expect(commit).toHaveBeenCalledTimes(1);
      expect(commit.mock.calls).toEqual([
        [types.UPDATE_MESSAGE_UNREAD_COUNT, { id: 1, lastSeen }],
      ]);
    });
    it('sends correct mutations if api is unsuccessful', async () => {
      axios.post.mockRejectedValue({ message: 'Incorrect header' });
      await actions.markMessagesRead({ commit }, { id: 1 });
      expect(commit.mock.calls).toEqual([]);
    });
  });

  describe('#markMessagesUnread', () => {
    it('sends correct mutations if API is successful', async () => {
      const lastSeen = new Date().getTime() / 1000;
      axios.post.mockResolvedValue({
        data: { id: 1, agent_last_seen_at: lastSeen, unread_count: 1 },
      });
      await actions.markMessagesUnread({ commit }, { id: 1 });
      vi.runAllTimers();
      expect(commit).toHaveBeenCalledTimes(1);
      expect(commit.mock.calls).toEqual([
        [
          types.UPDATE_MESSAGE_UNREAD_COUNT,
          { id: 1, lastSeen, unreadCount: 1 },
        ],
      ]);
    });
    it('sends correct mutations if API is unsuccessful', async () => {
      axios.post.mockRejectedValue({ message: 'Incorrect header' });
      await expect(
        actions.markMessagesUnread({ commit }, { id: 1 })
      ).rejects.toThrow(Error);
    });
  });

  describe('#sendEmailTranscript', () => {
    it('sends correct mutations if api is successful', async () => {
      axios.post.mockResolvedValue({});
      await actions.sendEmailTranscript(
        { commit },
        { conversationId: 1, email: 'testemail@example.com' }
      );
      expect(commit).toHaveBeenCalledTimes(0);
      expect(commit.mock.calls).toEqual([]);
    });
  });

  describe('#assignAgent', () => {
    it('sends correct mutations if assignment is successful', async () => {
      axios.post.mockResolvedValue({
        data: { id: 1, name: 'User' },
      });
      await actions.assignAgent(
        { dispatch },
        { conversationId: 1, agentId: 1, assigneeType: 'AgentBot' }
      );
      expect(dispatch).toHaveBeenCalledWith('setCurrentChatAssignee', {
        conversationId: 1,
        assignee: { id: 1, name: 'User' },
        assigneeType: 'AgentBot',
      });
    });
  });

  describe('#setCurrentChatAssignee', () => {
    it('sends correct mutations if assignment is successful', async () => {
      const payload = {
        conversationId: 1,
        assignee: { id: 1, name: 'User' },
        assigneeType: 'AgentBot',
      };
      await actions.setCurrentChatAssignee({ commit }, payload);
      expect(commit).toHaveBeenCalledTimes(1);
      expect(commit.mock.calls).toEqual([['ASSIGN_AGENT', payload]]);
    });
  });

  describe('#toggleStatus', () => {
    it('sends correct mutations if toggle status is successful', async () => {
      axios.post.mockResolvedValue({
        data: {
          payload: {
            conversation_id: 1,
            current_status: 'snoozed',
            snoozed_until: null,
          },
        },
      });
      await actions.toggleStatus(
        { commit },
        { conversationId: 1, status: 'snoozed' }
      );
      expect(commit).toHaveBeenCalledTimes(1);
      expect(commit.mock.calls).toEqual([
        [
          'CHANGE_CONVERSATION_STATUS',
          { conversationId: 1, status: 'snoozed', snoozedUntil: null },
        ],
      ]);
    });
  });

  describe('#assignTeam', () => {
    it('sends correct mutations if assignment is successful', async () => {
      axios.post.mockResolvedValue({
        data: { id: 1, name: 'Team' },
      });
      await actions.assignTeam({ commit }, { conversationId: 1, teamId: 1 });
      expect(commit).toHaveBeenCalledTimes(0);
      expect(commit.mock.calls).toEqual([]);
    });
  });

  describe('#setCurrentChatTeam', () => {
    it('sends correct mutations if assignment is successful', async () => {
      axios.post.mockResolvedValue({
        data: { id: 1, name: 'Team' },
      });
      await actions.setCurrentChatTeam(
        { commit },
        { team: { id: 1, name: 'Team' }, conversationId: 1 }
      );
      expect(commit).toHaveBeenCalledTimes(1);
      expect(commit.mock.calls).toEqual([
        ['ASSIGN_TEAM', { team: { id: 1, name: 'Team' }, conversationId: 1 }],
      ]);
    });
  });

  describe('#fetchFilteredConversations', () => {
    it('fetches filtered conversations with a mock commit', async () => {
      axios.post.mockResolvedValue({
        data: dataReceived,
      });
      await actions.fetchFilteredConversations(
        { commit, dispatch, state: { listGeneration: 0 } },
        dataToSend
      );
      expect(commit).toHaveBeenCalledTimes(4);
      expect(commit.mock.calls).toEqual([
        ['SET_LIST_LOADING_STATUS'],
        ['SET_ALL_CONVERSATION', dataReceived.payload],
        ['CLEAR_LIST_LOADING_STATUS'],
        [
          `contacts/${types.SET_CONTACTS}`,
          dataReceived.payload.map(chat => chat.meta.sender),
        ],
      ]);
    });

    it('clears the loading state and rethrows if the request fails', async () => {
      axios.post.mockRejectedValue(new Error('Request failed'));
      await expect(
        actions.fetchFilteredConversations(
          { commit, state: { listGeneration: 0 } },
          dataToSend
        )
      ).rejects.toThrow('Request failed');
      expect(commit.mock.calls).toEqual([
        ['SET_LIST_LOADING_STATUS'],
        ['CLEAR_LIST_LOADING_STATUS'],
      ]);
    });
  });

  describe('#setConversationFilter', () => {
    it('commits the correct mutation and sets filter state', () => {
      const filters = [
        {
          attribute_key: 'status',
          filter_operator: 'equal_to',
          values: [{ id: 'snoozed', name: 'Snoozed' }],
          query_operator: 'and',
        },
      ];
      actions.setConversationFilters({ commit }, filters);
      expect(commit.mock.calls).toEqual([
        [types.SET_CONVERSATION_FILTERS, filters],
      ]);
    });
  });

  describe('#clearConversationFilter', () => {
    it('commits the correct mutation and clears filter state', () => {
      actions.clearConversationFilters({ commit });
      expect(commit.mock.calls).toEqual([[types.CLEAR_CONVERSATION_FILTERS]]);
    });
  });

  describe('#updateConversationLastActivity', () => {
    it('sends correct action', async () => {
      await actions.updateConversationLastActivity(
        { commit },
        { conversationId: 1, lastActivityAt: 12121212 }
      );
      expect(commit.mock.calls).toEqual([
        [
          'UPDATE_CONVERSATION_LAST_ACTIVITY',
          { conversationId: 1, lastActivityAt: 12121212 },
        ],
      ]);
    });
  });

  describe('#setChatSortFilter', () => {
    it('sends correct action', async () => {
      await actions.setChatSortFilter(
        { commit },
        { data: 'sort_on_created_at' }
      );
      expect(commit.mock.calls).toEqual([
        ['CHANGE_CHAT_SORT_FILTER', { data: 'sort_on_created_at' }],
      ]);
    });
  });
});

describe('#deleteMessage', () => {
  it('sends correct actions if API is success', async () => {
    const [conversationId, messageId] = [1, 1];
    axios.delete.mockResolvedValue({
      data: { id: 1, content: 'deleted' },
    });
    await actions.deleteMessage({ commit }, { conversationId, messageId });
    expect(commit.mock.calls).toEqual([
      [types.ADD_MESSAGE, { id: 1, content: 'deleted' }],
      [types.DELETE_CONVERSATION_ATTACHMENTS, { id: 1, content: 'deleted' }],
    ]);
  });
  it('sends no actions if API is error', async () => {
    const [conversationId, messageId] = [1, 1];
    axios.delete.mockRejectedValue({ message: 'Incorrect header' });
    await expect(
      actions.deleteMessage({ commit }, { conversationId, messageId })
    ).rejects.toThrow(Error);
    expect(commit.mock.calls).toEqual([]);
  });

  describe('#deleteConversation', () => {
    it('send correct actions if API is success', async () => {
      axios.delete.mockResolvedValue({
        data: { id: 1 },
      });
      await actions.deleteConversation({ commit, dispatch }, 1);
      expect(commit.mock.calls).toEqual([[types.DELETE_CONVERSATION, 1]]);
      expect(dispatch.mock.calls).toEqual([
        ['conversationStats/get', {}, { root: true }],
      ]);
    });

    it('send no actions if API is error', async () => {
      axios.delete.mockRejectedValue({ message: 'Incorrect header' });
      await expect(
        actions.deleteConversation({ commit, dispatch }, 1)
      ).rejects.toThrow(Error);
      expect(commit.mock.calls).toEqual([]);
      expect(dispatch.mock.calls).toEqual([]);
    });
  });

  describe('#updateCustomAttributes', () => {
    it('update conversation custom attributes', async () => {
      axios.post.mockResolvedValue({
        data: { custom_attributes: { order_d: '1001' } },
      });
      await actions.updateCustomAttributes(
        { commit },
        {
          conversationId: 1,
          customAttributes: { order_d: '1001' },
        }
      );
      expect(commit.mock.calls).toEqual([
        [
          types.UPDATE_CONVERSATION_CUSTOM_ATTRIBUTES,
          {
            conversationId: 1,
            customAttributes: { order_d: '1001' },
          },
        ],
      ]);
    });
  });
});

describe('#addMentions', () => {
  it('does not send mutations if the view is not mentions', () => {
    actions.addMentions(
      { commit, dispatch, rootState: { route: { name: 'home' } } },
      { id: 1 }
    );
    expect(commit.mock.calls).toEqual([]);
    expect(dispatch.mock.calls).toEqual([]);
  });

  it('send mutations if the view is mentions', () => {
    actions.addMentions(
      {
        dispatch,
        rootState: { route: { name: 'conversation_mentions' } },
      },
      { id: 1, meta: { sender: { id: 1 } } }
    );
    expect(dispatch.mock.calls).toEqual([
      ['updateConversation', { id: 1, meta: { sender: { id: 1 } } }],
    ]);
  });

  it('#syncActiveConversationMessages', async () => {
    const conversations = [
      {
        id: 1,
        messages: [
          {
            id: 1,
            content: 'Hello',
          },
        ],
        meta: { sender: { id: 1, name: 'john-doe' } },
        inbox_id: 1,
      },
    ];
    axios.get.mockResolvedValue({
      data: {
        payload: [{ id: 2, content: 'Welcome' }],
        meta: {
          agent_last_seen_at: '2023-04-20T05:22:42.990Z',
        },
      },
    });
    await actions.syncActiveConversationMessages(
      {
        commit,
        dispatch,
        state: {
          allConversations: conversations,
          syncConversationsMessages: {
            1: 1,
          },
        },
      },
      { conversationId: 1 }
    );
    expect(commit.mock.calls).toEqual([
      [
        'conversationMetadata/SET_CONVERSATION_METADATA',
        {
          id: 1,
          data: {
            agent_last_seen_at: '2023-04-20T05:22:42.990Z',
          },
        },
      ],
      [
        'SET_MISSING_MESSAGES',
        {
          id: 1,
          data: [
            { id: 1, content: 'Hello' },
            { id: 2, content: 'Welcome' },
          ],
        },
      ],
      [
        'SET_LAST_MESSAGE_ID_FOR_SYNC_CONVERSATION',
        { conversationId: 1, messageId: null },
      ],
    ]);
  });

  describe('#fetchAllAttachments', () => {
    it('fetches all attachments', async () => {
      axios.get.mockResolvedValue({
        data: {
          payload: [
            {
              id: 1,
              message_id: 1,
              file_type: 'image',
              data_url: '',
              thumb_url: '',
            },
          ],
        },
      });
      await actions.fetchAllAttachments({ commit }, 1);
      expect(commit.mock.calls).toEqual([
        [
          types.SET_ALL_ATTACHMENTS,
          {
            id: 1,
            data: [
              {
                id: 1,
                message_id: 1,
                file_type: 'image',
                data_url: '',
                thumb_url: '',
              },
            ],
          },
        ],
      ]);
    });
  });

  describe('#setContextMenuChatId', () => {
    it('sets the context menu chat id', () => {
      actions.setContextMenuChatId({ commit }, 1);
      expect(commit.mock.calls).toEqual([[types.SET_CONTEXT_MENU_CHAT_ID, 1]]);
    });
  });

  describe('#setChatListFilters', () => {
    it('set chat list filters', () => {
      const filters = {
        inboxId: 1,
        assigneeType: 'me',
        status: 'open',
        sortBy: 'created_at',
        page: 1,
        labels: ['label'],
        teamId: 1,
        conversationType: 'mention',
      };
      actions.setChatListFilters({ commit }, filters);
      expect(commit.mock.calls).toEqual([
        [types.SET_CHAT_LIST_FILTERS, filters],
      ]);
    });
  });

  describe('#updateChatListFilters', () => {
    it('update chat list filters', () => {
      actions.updateChatListFilters({ commit }, { updatedWithin: 20 });
      expect(commit.mock.calls).toEqual([
        [types.UPDATE_CHAT_LIST_FILTERS, { updatedWithin: 20 }],
      ]);
    });
  });

  describe('#setActiveChat', () => {
    it('should commit SET_CHAT_DATA_FETCHED with conversation ID after fetch', async () => {
      const localCommit = vi.fn();
      const localDispatch = vi.fn().mockResolvedValue();
      const data = { id: 42, messages: [{ id: 100 }] };

      await actions.setActiveChat(
        { commit: localCommit, dispatch: localDispatch },
        { data, after: 99 }
      );

      expect(localCommit.mock.calls).toEqual([
        [types.SET_CURRENT_CHAT_WINDOW, data],
        [types.CLEAR_ALL_MESSAGES_LOADED, 42],
        [types.SET_CHAT_DATA_FETCHED, 42],
      ]);
      expect(localDispatch).toHaveBeenCalledWith('fetchPreviousMessages', {
        after: 99,
        before: 100,
        conversationId: 42,
      });
    });

    it('should not dispatch fetchPreviousMessages if dataFetched is already set', async () => {
      const localCommit = vi.fn();
      const localDispatch = vi.fn();
      const data = { id: 42, messages: [{ id: 100 }], dataFetched: true };

      await actions.setActiveChat(
        { commit: localCommit, dispatch: localDispatch },
        { data }
      );

      expect(localCommit.mock.calls).toEqual([
        [types.SET_CURRENT_CHAT_WINDOW, data],
        [types.CLEAR_ALL_MESSAGES_LOADED, 42],
      ]);
      expect(localDispatch).not.toHaveBeenCalled();
    });

    it('should commit SET_CHAT_DATA_FETCHED by ID, not mutate the data object directly (race condition fix)', async () => {
      const localCommit = vi.fn();
      const localDispatch = vi.fn().mockResolvedValue();
      const data = { id: 42, messages: [{ id: 100 }] };

      await actions.setActiveChat(
        { commit: localCommit, dispatch: localDispatch },
        { data }
      );

      // The action must NOT set dataFetched on the data object directly
      expect(data.dataFetched).toBeUndefined();

      // Instead it commits a mutation that finds the conversation by ID in the store
      expect(localCommit).toHaveBeenCalledWith(types.SET_CHAT_DATA_FETCHED, 42);
    });
  });

  describe('#getInboxCaptainAssistantById', () => {
    it('fetches inbox assistant by id', async () => {
      axios.get.mockResolvedValue({
        data: {
          id: 1,
          name: 'Assistant',
          description: 'Assistant description',
        },
      });
      await actions.getInboxCaptainAssistantById({ commit }, 1);
      expect(commit.mock.calls).toEqual([
        [
          types.SET_INBOX_CAPTAIN_ASSISTANT,
          { id: 1, name: 'Assistant', description: 'Assistant description' },
        ],
      ]);
    });
  });
});

describe('#ensureAuthorizedConversation', () => {
  const ACCOUNT_ID = 1;
  let localDispatch;

  const rootGettersFor = (present = null, accountId = ACCOUNT_ID) => ({
    getCurrentAccountId: accountId,
    getConversationById: () => present,
  });

  // Runs the 300 ms trailing debounce and lets the request promise chain settle.
  const flush = async () => {
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(0);
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    resetRealtimeState();
    localDispatch = vi.fn();
  });

  afterEach(() => {
    resetRealtimeState();
    vi.useRealTimers();
  });

  it('issues exactly one authorized fetch for an unknown conversation', async () => {
    axios.get.mockResolvedValue({ data: { id: 5, account_id: ACCOUNT_ID } });
    actions.ensureAuthorizedConversation(
      { dispatch: localDispatch, rootGetters: rootGettersFor() },
      { conversationId: 5, message: { id: 1, conversation_id: 5 } }
    );
    await flush();
    expect(axios.get).toHaveBeenCalledTimes(1);
  });

  it('collapses many events for one unknown conversation into a single fetch', async () => {
    axios.get.mockResolvedValue({ data: { id: 5, account_id: ACCOUNT_ID } });
    for (let i = 0; i < 10; i += 1) {
      actions.ensureAuthorizedConversation(
        { dispatch: localDispatch, rootGetters: rootGettersFor() },
        { conversationId: 5, message: { id: i, conversation_id: 5 } }
      );
    }
    await flush();
    expect(axios.get).toHaveBeenCalledTimes(1);
    // every buffered message is replayed onto the authorized copy
    const replayed = localDispatch.mock.calls.filter(
      c => c[0] === 'addMessage'
    );
    expect(replayed).toHaveLength(10);
  });

  it('upserts only through the authorized helper on success', async () => {
    const data = { id: 5, account_id: ACCOUNT_ID, updated_at: 10 };
    axios.get.mockResolvedValue({ data });
    actions.ensureAuthorizedConversation(
      { dispatch: localDispatch, rootGetters: rootGettersFor() },
      { conversationId: 5, conversationPayload: { id: 5, updated_at: 1 } }
    );
    await flush();
    expect(localDispatch).toHaveBeenCalledWith(
      'upsertFetchedConversation',
      data
    );
    // the buffered payload is older than the fetched copy, so it is not applied
    expect(
      localDispatch.mock.calls.filter(c => c[0] === 'updateConversation')
    ).toHaveLength(0);
  });

  it('applies a buffered conversation payload only when it is newer', async () => {
    const data = { id: 5, account_id: ACCOUNT_ID, updated_at: 10 };
    axios.get.mockResolvedValue({ data });
    actions.ensureAuthorizedConversation(
      { dispatch: localDispatch, rootGetters: rootGettersFor() },
      { conversationId: 5, conversationPayload: { id: 5, updated_at: 99 } }
    );
    await flush();
    expect(localDispatch).toHaveBeenCalledWith('updateConversation', {
      id: 5,
      updated_at: 99,
    });
  });

  it.each([401, 403, 404, 500])(
    'inserts nothing when the API refuses with %i',
    async status => {
      axios.get.mockRejectedValue({ response: { status } });
      actions.ensureAuthorizedConversation(
        { dispatch: localDispatch, rootGetters: rootGettersFor() },
        { conversationId: 5, message: { id: 1, conversation_id: 5 } }
      );
      await flush();
      expect(
        localDispatch.mock.calls.filter(
          c => c[0] === 'upsertFetchedConversation'
        )
      ).toHaveLength(0);
    }
  );

  it('inserts nothing on a network error', async () => {
    axios.get.mockRejectedValue(new Error('Network Error'));
    actions.ensureAuthorizedConversation(
      { dispatch: localDispatch, rootGetters: rootGettersFor() },
      { conversationId: 5, message: { id: 1, conversation_id: 5 } }
    );
    await flush();
    expect(localDispatch).not.toHaveBeenCalledWith(
      'upsertFetchedConversation',
      expect.anything()
    );
  });

  it('keeps no negative cache, so a later event retries', async () => {
    axios.get.mockRejectedValueOnce({ response: { status: 403 } });
    actions.ensureAuthorizedConversation(
      { dispatch: localDispatch, rootGetters: rootGettersFor() },
      { conversationId: 5, message: { id: 1, conversation_id: 5 } }
    );
    await flush();
    expect(axios.get).toHaveBeenCalledTimes(1);
    expect(inflightFetches.size).toBe(0);

    axios.get.mockResolvedValue({ data: { id: 5, account_id: ACCOUNT_ID } });
    actions.ensureAuthorizedConversation(
      { dispatch: localDispatch, rootGetters: rootGettersFor() },
      { conversationId: 5, message: { id: 2, conversation_id: 5 } }
    );
    await flush();
    expect(axios.get).toHaveBeenCalledTimes(2);
    expect(localDispatch).toHaveBeenCalledWith(
      'upsertFetchedConversation',
      expect.objectContaining({ id: 5 })
    );
  });

  it('discards a response whose payload belongs to another account', async () => {
    axios.get.mockResolvedValue({ data: { id: 5, account_id: 999 } });
    actions.ensureAuthorizedConversation(
      { dispatch: localDispatch, rootGetters: rootGettersFor() },
      { conversationId: 5, message: { id: 1, conversation_id: 5 } }
    );
    await flush();
    expect(localDispatch).not.toHaveBeenCalledWith(
      'upsertFetchedConversation',
      expect.anything()
    );
  });

  it('discards a response after the account generation changed', async () => {
    axios.get.mockImplementation(() => {
      resetRealtimeState(); // account switch lands while the request is in flight
      return Promise.resolve({ data: { id: 5, account_id: ACCOUNT_ID } });
    });
    actions.ensureAuthorizedConversation(
      { dispatch: localDispatch, rootGetters: rootGettersFor() },
      { conversationId: 5, message: { id: 1, conversation_id: 5 } }
    );
    await flush();
    expect(localDispatch).not.toHaveBeenCalledWith(
      'upsertFetchedConversation',
      expect.anything()
    );
  });

  it('discards a response once the store has moved to another account', async () => {
    let currentAccountId = ACCOUNT_ID;
    const rootGetters = {
      get getCurrentAccountId() {
        return currentAccountId;
      },
      getConversationById: () => null,
    };
    axios.get.mockImplementation(() => {
      // the account switch lands while the authorized show is in flight
      currentAccountId = 2;
      return Promise.resolve({ data: { id: 5, account_id: ACCOUNT_ID } });
    });

    actions.ensureAuthorizedConversation(
      { dispatch: localDispatch, rootGetters },
      { conversationId: 5, message: { id: 1, conversation_id: 5 } }
    );
    await flush();

    expect(localDispatch).not.toHaveBeenCalledWith(
      'upsertFetchedConversation',
      expect.anything()
    );
  });

  it('does not let an older settled fetch delete a newer entry for the same id', async () => {
    const key = realtimeKey(ACCOUNT_ID, 5);
    axios.get.mockResolvedValue({ data: { id: 5, account_id: ACCOUNT_ID } });
    actions.ensureAuthorizedConversation(
      { dispatch: localDispatch, rootGetters: rootGettersFor() },
      { conversationId: 5, message: { id: 1, conversation_id: 5 } }
    );
    const firstEntry = inflightFetches.get(key);

    // a lifecycle reset invalidates the first entry, then a new event creates a second one
    resetRealtimeState();
    actions.ensureAuthorizedConversation(
      { dispatch: localDispatch, rootGetters: rootGettersFor() },
      { conversationId: 5, message: { id: 2, conversation_id: 5 } }
    );
    const secondEntry = inflightFetches.get(key);
    expect(secondEntry).not.toBe(firstEntry);

    await flush();
    // the second entry owned the key and completed; the first never removed it prematurely
    expect(localDispatch).toHaveBeenCalledWith(
      'upsertFetchedConversation',
      expect.objectContaining({ id: 5 })
    );
  });

  it('replays an event that arrives while the authorized request is still running', async () => {
    let resolveShow;
    axios.get.mockImplementation(
      () =>
        new Promise(resolve => {
          resolveShow = resolve;
        })
    );

    actions.ensureAuthorizedConversation(
      { dispatch: localDispatch, rootGetters: rootGettersFor() },
      {
        conversationId: 5,
        message: { id: 1, conversation_id: 5, created_at: 1 },
      }
    );
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    expect(axios.get).toHaveBeenCalledTimes(1);

    // a second cable event lands while the request is in flight - it must merge into the same
    // entry's buffer, not start a second fetch and not be dropped
    actions.ensureAuthorizedConversation(
      { dispatch: localDispatch, rootGetters: rootGettersFor() },
      {
        conversationId: 5,
        message: { id: 2, conversation_id: 5, created_at: 2 },
      }
    );
    expect(axios.get).toHaveBeenCalledTimes(1);

    resolveShow({ data: { id: 5, account_id: ACCOUNT_ID } });
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(0);

    const replayed = localDispatch.mock.calls
      .filter(c => c[0] === 'addMessage')
      .map(c => c[1].id);
    expect(replayed).toEqual([1, 2]);
  });

  it('does not lose an event that arrives after the entry has been cleaned up', async () => {
    axios.get.mockResolvedValue({ data: { id: 5, account_id: ACCOUNT_ID } });
    actions.ensureAuthorizedConversation(
      { dispatch: localDispatch, rootGetters: rootGettersFor() },
      { conversationId: 5, message: { id: 1, conversation_id: 5 } }
    );
    await flush();
    expect(inflightFetches.size).toBe(0);

    // the conversation is now in the store, so a later event takes the ordinary update path
    localDispatch.mockClear();
    actions.ensureAuthorizedConversation(
      { dispatch: localDispatch, rootGetters: rootGettersFor({ id: 5 }) },
      { conversationId: 5, message: { id: 2, conversation_id: 5 } }
    );
    expect(localDispatch).toHaveBeenCalledWith('addMessage', {
      id: 2,
      conversation_id: 5,
    });
  });

  it('takes the ordinary update path when the conversation is already present', async () => {
    actions.ensureAuthorizedConversation(
      {
        dispatch: localDispatch,
        rootGetters: rootGettersFor({ id: 5 }),
      },
      { conversationId: 5, message: { id: 1, conversation_id: 5 } }
    );
    await flush();
    expect(axios.get).not.toHaveBeenCalled();
    expect(localDispatch).toHaveBeenCalledWith('addMessage', {
      id: 1,
      conversation_id: 5,
    });
  });
});

describe('#bufferMessageUpdateIfFetching', () => {
  beforeEach(() => {
    resetRealtimeState();
  });
  afterEach(() => {
    resetRealtimeState();
  });

  it('never starts a fetch of its own', () => {
    vi.clearAllMocks();
    actions.bufferMessageUpdateIfFetching(
      { rootGetters: { getCurrentAccountId: 1 } },
      { id: 9, conversation_id: 5 }
    );
    expect(axios.get).not.toHaveBeenCalled();
    expect(inflightFetches.size).toBe(0);
  });
});

describe('#listGeneration stale-response protection', () => {
  let localCommit;
  let localDispatch;

  beforeEach(() => {
    vi.clearAllMocks();
    localCommit = vi.fn();
    localDispatch = vi.fn();
  });

  const commitNames = () => localCommit.mock.calls.map(c => c[0]);

  describe('#fetchAllConversations', () => {
    it('commits nothing when the list was reset while the page was in flight', async () => {
      const state = { listGeneration: 0, conversationFilters: {} };
      axios.get.mockImplementation(() => {
        // EMPTY_ALL_CONVERSATION landed mid-flight (queue/filter/route switch)
        state.listGeneration += 1;
        return Promise.resolve({ data: { data: dataReceived } });
      });

      await actions.fetchAllConversations({
        commit: localCommit,
        state,
        dispatch: localDispatch,
      });

      // only the loading flag set before the request; no rows, stats, cursor or loading clear
      expect(commitNames()).toEqual(['SET_LIST_LOADING_STATUS']);
      expect(localDispatch).not.toHaveBeenCalled();
    });

    it('does not clear the newer request loading state when a stale request fails', async () => {
      const state = { listGeneration: 0, conversationFilters: {} };
      axios.get.mockImplementation(() => {
        state.listGeneration += 1;
        return Promise.reject(new Error('Request failed'));
      });

      await actions.fetchAllConversations({
        commit: localCommit,
        state,
        dispatch: localDispatch,
      });

      expect(commitNames()).toEqual(['SET_LIST_LOADING_STATUS']);
      expect(commitNames()).not.toContain('CLEAR_LIST_LOADING_STATUS');
    });

    it('clears the loading state when the current request fails', async () => {
      const state = { listGeneration: 0, conversationFilters: {} };
      axios.get.mockRejectedValue(new Error('Request failed'));

      await actions.fetchAllConversations({
        commit: localCommit,
        state,
        dispatch: localDispatch,
      });

      // without this the spinner never clears and no page can load again
      expect(commitNames()).toEqual([
        'SET_LIST_LOADING_STATUS',
        'CLEAR_LIST_LOADING_STATUS',
      ]);
    });
  });

  describe('#fetchFilteredConversations', () => {
    it('commits nothing when the list was reset while the request was in flight', async () => {
      const state = { listGeneration: 0 };
      axios.post.mockImplementation(() => {
        state.listGeneration += 1;
        return Promise.resolve({ data: dataReceived });
      });

      await actions.fetchFilteredConversations(
        { commit: localCommit, state, dispatch: localDispatch },
        dataToSend
      );

      expect(commitNames()).toEqual(['SET_LIST_LOADING_STATUS']);
    });

    it('does not clear the newer request loading state when a stale request fails', async () => {
      const state = { listGeneration: 0 };
      axios.post.mockImplementation(() => {
        state.listGeneration += 1;
        return Promise.reject(new Error('Request failed'));
      });

      await expect(
        actions.fetchFilteredConversations(
          { commit: localCommit, state, dispatch: localDispatch },
          dataToSend
        )
      ).rejects.toThrow('Request failed');

      expect(commitNames()).toEqual(['SET_LIST_LOADING_STATUS']);
    });
  });
});

describe('#setConversationLastMessageId', () => {
  it('uses the newest numeric server id and ignores an optimistic uuid tail', async () => {
    const localCommit = vi.fn();
    const state = {
      allConversations: [
        {
          id: 1,
          messages: [
            { id: 100 },
            { id: 200 },
            { id: 'uuid-x', echo_id: 'uuid-x', status: 'progress' },
          ],
        },
      ],
    };

    await actions.setConversationLastMessageId(
      { commit: localCommit, state },
      { conversationId: 1 }
    );

    // a uuid cursor would be clamped to 0 server-side and return the OLDEST messages
    expect(localCommit).toHaveBeenCalledWith(
      types.SET_LAST_MESSAGE_ID_IN_SYNC_CONVERSATION,
      { conversationId: 1, messageId: 200 }
    );
  });

  it('commits nothing when every loaded message is optimistic', async () => {
    const localCommit = vi.fn();
    const state = {
      allConversations: [
        {
          id: 1,
          messages: [{ id: 'uuid-a', echo_id: 'uuid-a', status: 'progress' }],
        },
      ],
    };

    await actions.setConversationLastMessageId(
      { commit: localCommit, state },
      { conversationId: 1 }
    );

    expect(localCommit).not.toHaveBeenCalled();
  });
});

describe('#Needs Reply pagination', () => {
  // Wires the real conversationPage module to fetchAllConversations, so the page cursor is
  // written and read through the same key the ChatList reads (`needsReply`, not `all`).
  const buildPageStore = () => {
    const pageState = JSON.parse(JSON.stringify(conversationPage.state));
    const localDispatch = vi.fn((actionName, payload) => {
      const [namespace, name] = actionName.split('/');
      if (namespace === 'conversationPage') {
        conversationPage.actions[name](
          {
            commit: (type, mutationPayload) =>
              conversationPage.mutations[type](pageState, mutationPayload),
          },
          payload
        );
      }
      return Promise.resolve();
    });
    return { pageState, localDispatch };
  };

  const conversationsPage = [{ id: 1, meta: { sender: { id: 11 } } }];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // The ChatList asks for `currentPage + 1` on every infinite-scroll load.
  const scrollThreePages = async ({ pageState, localDispatch, needsReply }) => {
    const requestedPages = [];
    axios.get.mockImplementation((url, { params }) => {
      requestedPages.push(params.page);
      return Promise.resolve({
        data: { data: { payload: conversationsPage, meta: {} } },
      });
    });

    const filterKey = needsReply ? 'needsReply' : 'all';
    const state = { listGeneration: 0, conversationFilters: {} };

    for (let load = 0; load < 3; load += 1) {
      state.conversationFilters = {
        assigneeType: 'all',
        needsReply,
        page: pageState.currentPage[filterKey] + 1,
      };
      // eslint-disable-next-line no-await-in-loop
      await actions.fetchAllConversations({
        commit: vi.fn(),
        state,
        dispatch: localDispatch,
      });
    }

    return requestedPages;
  };

  it('advances page 1 -> 2 -> 3 on the Needs Reply queue and never re-requests page 1', async () => {
    const { pageState, localDispatch } = buildPageStore();

    const requestedPages = await scrollThreePages({
      pageState,
      localDispatch,
      needsReply: true,
    });

    // Writing the cursor under `all` while the ChatList reads `needsReply` left the cursor at
    // 0, so infinite scroll asked for page 1 forever.
    expect(requestedPages).toEqual([1, 2, 3]);
    expect(pageState.currentPage.needsReply).toBe(3);
    expect(pageState.currentPage.all).toBe(0);
  });

  it('advances page 1 -> 2 -> 3 on the All queue and leaves the Needs Reply cursor alone', async () => {
    const { pageState, localDispatch } = buildPageStore();

    const requestedPages = await scrollThreePages({
      pageState,
      localDispatch,
      needsReply: false,
    });

    expect(requestedPages).toEqual([1, 2, 3]);
    expect(pageState.currentPage.all).toBe(3);
    expect(pageState.currentPage.needsReply).toBe(0);
  });

  it('marks only the Needs Reply queue end reached when a Needs Reply page comes back empty', async () => {
    const { pageState, localDispatch } = buildPageStore();
    axios.get.mockResolvedValue({ data: { data: { payload: [], meta: {} } } });

    await actions.fetchAllConversations({
      commit: vi.fn(),
      state: {
        listGeneration: 0,
        conversationFilters: { assigneeType: 'all', needsReply: true, page: 1 },
      },
      dispatch: localDispatch,
    });

    expect(pageState.hasEndReached.needsReply).toBe(true);
    expect(pageState.hasEndReached.all).toBe(false);
  });
});
