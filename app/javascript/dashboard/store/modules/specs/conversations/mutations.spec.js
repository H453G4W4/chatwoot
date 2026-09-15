import { describe } from 'vitest';
import types from '../../../mutation-types';
import { mutations } from '../../conversations';

vi.mock('shared/helpers/mitt', () => ({
  emitter: {
    emit: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
  },
}));

import { emitter } from 'shared/helpers/mitt';

describe('#mutations', () => {
  describe('#EMPTY_ALL_CONVERSATION', () => {
    it('empty conversations', () => {
      const state = { allConversations: [{ id: 1 }], selectedChatId: 1 };
      mutations[types.EMPTY_ALL_CONVERSATION](state);
      expect(state.allConversations).toEqual([]);
      expect(state.selectedChatId).toEqual(null);
    });
  });

  describe('#UPDATE_MESSAGE_UNREAD_COUNT', () => {
    it('mark conversation as read', () => {
      const state = { allConversations: [{ id: 1 }] };
      const lastSeen = new Date().getTime() / 1000;
      mutations[types.UPDATE_MESSAGE_UNREAD_COUNT](state, { id: 1, lastSeen });
      expect(state.allConversations).toEqual([
        { id: 1, agent_last_seen_at: lastSeen, unread_count: 0 },
      ]);
    });

    it('doesnot send any mutation if chat doesnot exist', () => {
      const state = { allConversations: [] };
      const lastSeen = new Date().getTime() / 1000;
      mutations[types.UPDATE_MESSAGE_UNREAD_COUNT](state, { id: 1, lastSeen });
      expect(state.allConversations).toEqual([]);
    });
  });

  describe('#CLEAR_CURRENT_CHAT_WINDOW', () => {
    it('clears current chat window', () => {
      const state = { selectedChatId: 1 };
      mutations[types.CLEAR_CURRENT_CHAT_WINDOW](state);
      expect(state.selectedChatId).toEqual(null);
    });
  });

  describe('#ASSIGN_TEAM', () => {
    it('clears current chat window', () => {
      const state = { allConversations: [{ id: 1, meta: {} }] };
      mutations[types.UPDATE_CONVERSATION_LAST_ACTIVITY](state, {
        lastActivityAt: 1602256198,
        conversationId: 1,
      });

      expect(state.allConversations).toEqual([
        {
          id: 1,
          meta: {},
          last_activity_at: 1602256198,
          timestamp: 1602256198,
        },
      ]);
    });
  });
  describe('#UPDATE_CONVERSATION_LAST_ACTIVITY', () => {
    it('update conversation last activity', () => {
      const state = { allConversations: [{ id: 1, meta: {} }] };
      mutations[types.ASSIGN_TEAM](state, {
        team: { id: 1, name: 'Team 1' },
        conversationId: 1,
      });
      expect(state.allConversations).toEqual([
        { id: 1, meta: { team: { id: 1, name: 'Team 1' } } },
      ]);
    });
  });

  describe('#CHANGE_CHAT_SORT_FILTER', () => {
    it('update conversation sort filter', () => {
      const state = { chatSortFilter: 'latest' };
      mutations[types.CHANGE_CHAT_SORT_FILTER](state, {
        data: 'sort_on_created_at',
      });
      expect(state.chatSortFilter).toEqual({ data: 'sort_on_created_at' });
    });
  });

  describe('#SET_CURRENT_CHAT_WINDOW', () => {
    it('set current chat window', () => {
      const state = { selectedChatId: 1 };
      mutations[types.SET_CURRENT_CHAT_WINDOW](state, { id: 2 });
      expect(state.selectedChatId).toEqual(2);
    });

    it('does not set current chat window', () => {
      const state = { selectedChatId: 1 };
      mutations[types.SET_CURRENT_CHAT_WINDOW](state);
      expect(state.selectedChatId).toEqual(1);
    });
  });

  describe('#SET_CONVERSATION_CAN_REPLY', () => {
    it('set canReply flag', () => {
      const state = { allConversations: [{ id: 1, can_reply: false }] };
      mutations[types.SET_CONVERSATION_CAN_REPLY](state, {
        conversationId: 1,
        canReply: true,
      });
      expect(state.allConversations[0].can_reply).toEqual(true);
    });
  });

  describe('#ADD_MESSAGE', () => {
    it('does not add message to the store if conversation does not exist', () => {
      const state = { allConversations: [] };
      mutations[types.ADD_MESSAGE](state, { conversationId: 1 });
      expect(state.allConversations).toEqual([]);
    });

    it('add message to the conversation if it does not exist in the store', () => {
      global.bus = { $emit: vi.fn() };
      const state = {
        allConversations: [{ id: 1, messages: [] }],
        selectedChatId: -1,
      };
      mutations[types.ADD_MESSAGE](state, {
        conversation_id: 1,
        content: 'Test message',
        created_at: 1602256198,
      });
      expect(state.allConversations).toEqual([
        {
          id: 1,
          messages: [
            {
              conversation_id: 1,
              content: 'Test message',
              created_at: 1602256198,
            },
          ],
          last_activity_at: 1602256198,
          timestamp: 1602256198,
        },
      ]);
      expect(emitter.emit).not.toHaveBeenCalled();
    });

    it('add message to the conversation and emit scrollToMessage if it does not exist in the store', () => {
      global.bus = { $emit: vi.fn() };
      const state = {
        allConversations: [{ id: 1, messages: [] }],
        selectedChatId: 1,
      };
      mutations[types.ADD_MESSAGE](state, {
        conversation_id: 1,
        content: 'Test message',
        created_at: 1602256198,
      });
      expect(state.allConversations).toEqual([
        {
          id: 1,
          messages: [
            {
              conversation_id: 1,
              content: 'Test message',
              created_at: 1602256198,
            },
          ],
          last_activity_at: 1602256198,
          timestamp: 1602256198,
        },
      ]);
      expect(emitter.emit).toHaveBeenCalledWith('SCROLL_TO_MESSAGE');
    });

    it('update message if it exist in the store', () => {
      global.bus = { $emit: vi.fn() };
      const state = {
        allConversations: [
          {
            id: 1,
            messages: [
              {
                conversation_id: 1,
                content: 'Test message',
                created_at: 1602256198,
              },
            ],
          },
        ],
        selectedChatId: 1,
      };
      mutations[types.ADD_MESSAGE](state, {
        conversation_id: 1,
        content: 'Test message 1',
        created_at: 1602256198,
      });
      expect(state.allConversations).toEqual([
        {
          id: 1,
          messages: [
            {
              conversation_id: 1,
              content: 'Test message 1',
              created_at: 1602256198,
            },
          ],
          last_activity_at: 1602256198,
          timestamp: 1602256198,
        },
      ]);
      expect(emitter.emit).not.toHaveBeenCalled();
    });
  });

  describe('#CHANGE_CONVERSATION_STATUS', () => {
    it('updates the conversation status correctly', () => {
      const state = {
        allConversations: [
          {
            id: 1,
            messages: [],
            status: 'open',
          },
        ],
      };

      mutations[types.CHANGE_CONVERSATION_STATUS](state, {
        conversationId: '1',
        status: 'resolved',
      });

      expect(state.allConversations).toEqual([
        {
          id: 1,
          messages: [],
          status: 'resolved',
        },
      ]);
    });

    describe('#UPDATE_CONVERSATION_CUSTOM_ATTRIBUTES', () => {
      it('update conversation custom attributes', () => {
        const custom_attributes = { order_id: 1001 };
        const state = { allConversations: [{ id: 1, custom_attributes: {} }] };
        mutations[types.UPDATE_CONVERSATION_CUSTOM_ATTRIBUTES](state, {
          conversationId: 1,
          customAttributes: custom_attributes,
        });
        expect(state.allConversations[0].custom_attributes).toEqual(
          custom_attributes
        );
      });
    });
  });

  describe('#SET_CONVERSATION_FILTERS', () => {
    it('set conversation filter', () => {
      const appliedFilters = [
        {
          attribute_key: 'status',
          filter_operator: 'equal_to',
          values: [{ id: 'snoozed', name: 'Snoozed' }],
          query_operator: 'and',
        },
      ];
      mutations[types.SET_CONVERSATION_FILTERS](appliedFilters);
      expect(appliedFilters).toEqual([
        {
          attribute_key: 'status',
          filter_operator: 'equal_to',
          values: [{ id: 'snoozed', name: 'Snoozed' }],
          query_operator: 'and',
        },
      ]);
    });
  });

  describe('#CLEAR_CONVERSATION_FILTERS', () => {
    it('clears applied conversation filters', () => {
      const state = {
        appliedFilters: [
          {
            attribute_key: 'status',
            filter_operator: 'equal_to',
            values: [{ id: 'snoozed', name: 'Snoozed' }],
            query_operator: 'and',
          },
        ],
      };
      mutations[types.CLEAR_CONVERSATION_FILTERS](state);
      expect(state.appliedFilters).toEqual([]);
    });
  });

  describe('#SET_ALL_CONVERSATION', () => {
    it('set all conversation', () => {
      const state = { allConversations: [{ id: 1 }] };
      const data = [{ id: 1, name: 'test' }];
      mutations[types.SET_ALL_CONVERSATION](state, data);
      expect(state.allConversations).toEqual(data);
    });

    it('set all conversation in reconnect if selected chat id and conversation id is the same', () => {
      const state = {
        allConversations: [{ id: 1, status: 'open' }],
        selectedChatId: 1,
      };
      const data = [{ id: 1, name: 'test', status: 'resolved' }];
      mutations[types.SET_ALL_CONVERSATION](state, data);
      expect(state.allConversations).toEqual(data);
    });

    it('set all conversation in reconnect if selected chat id and conversation id is the same then do not update messages, attachments, dataFetched, allMessagesLoaded', () => {
      const state = {
        allConversations: [
          {
            id: 1,
            messages: [{ id: 1, content: 'test' }],
            dataFetched: true,
            allMessagesLoaded: true,
          },
        ],
        selectedChatId: 1,
      };
      const data = [
        {
          id: 1,
          name: 'test',
          messages: [{ id: 1, content: 'updated message' }],
          dataFetched: true,
          allMessagesLoaded: true,
        },
      ];
      const expected = [
        {
          id: 1,
          name: 'test',
          // merged by id: the loaded thread is kept and the overlapping message is refreshed
          // from the newer server payload, never replaced wholesale or truncated
          messages: [{ id: 1, content: 'updated message' }],
          dataFetched: true,
          allMessagesLoaded: true,
        },
      ];
      mutations[types.SET_ALL_CONVERSATION](state, data);
      expect(state.allConversations).toEqual(expected);
    });

    it('set all conversation in reconnect if selected chat id and conversation id is not the same', () => {
      const state = {
        allConversations: [{ id: 1, status: 'open' }],
        selectedChatId: 2,
      };
      const data = [{ id: 1, name: 'test', status: 'resolved' }];
      mutations[types.SET_ALL_CONVERSATION](state, data);
      expect(state.allConversations).toEqual(data);
    });

    it('set all conversation in reconnect if selected chat id and conversation id is not the same then update messages', () => {
      const state = {
        allConversations: [{ id: 1, messages: [{ id: 1, content: 'test' }] }],
        selectedChatId: 2,
      };
      const data = [
        { id: 1, name: 'test', messages: [{ id: 1, content: 'tested' }] },
      ];
      mutations[types.SET_ALL_CONVERSATION](state, data);
      expect(state.allConversations).toEqual(data);
    });
  });

  describe('#SET_ALL_ATTACHMENTS', () => {
    it('set all attachments', () => {
      const state = {
        allConversations: [{ id: 1 }],
        attachments: {},
      };
      const data = [{ id: 1, name: 'test' }];
      mutations[types.SET_ALL_ATTACHMENTS](state, { id: 1, data });
      expect(state.attachments[1]).toEqual(data);
    });
    it('set attachments key even if the attachments are empty', () => {
      const state = {
        allConversations: [{ id: 1 }],
        attachments: {},
      };
      const data = [];
      mutations[types.SET_ALL_ATTACHMENTS](state, { id: 1, data });
      expect(state.attachments[1]).toEqual([]);
    });
  });

  describe('#ADD_CONVERSATION_ATTACHMENTS', () => {
    it('add conversation attachments', () => {
      const state = {
        allConversations: [{ id: 1 }],
        attachments: {},
      };
      const message = {
        conversation_id: 1,
        status: 'sent',
        attachments: [{ id: 1, name: 'test' }],
      };

      mutations[types.ADD_CONVERSATION_ATTACHMENTS](state, message);
      expect(state.attachments[1]).toEqual(message.attachments);
    });

    it('should not add duplicate attachments', () => {
      const state = {
        allConversations: [{ id: 1 }],
        attachments: { 1: [{ id: 1, name: 'existing' }] },
      };
      const message = {
        conversation_id: 1,
        status: 'sent',
        attachments: [
          { id: 1, name: 'existing' },
          { id: 2, name: 'new' },
        ],
      };

      mutations[types.ADD_CONVERSATION_ATTACHMENTS](state, message);
      expect(state.attachments[1]).toHaveLength(2);
      expect(state.attachments[1]).toContainEqual({
        id: 1,
        name: 'existing',
      });
      expect(state.attachments[1]).toContainEqual({
        id: 2,
        name: 'new',
      });
    });

    it('should not add attachments if chat not found', () => {
      const state = {
        allConversations: [{ id: 1, attachments: [] }],
        attachments: {
          1: [],
        },
      };
      const message = {
        conversation_id: 2,
        status: 'sent',
        attachments: [{ id: 1, name: 'test' }],
      };

      mutations[types.ADD_CONVERSATION_ATTACHMENTS](state, message);
      expect(state.attachments[1]).toHaveLength(0);
    });
  });

  describe('#DELETE_CONVERSATION_ATTACHMENTS', () => {
    it('delete conversation attachments', () => {
      const state = {
        allConversations: [{ id: 1 }],
        attachments: {
          1: [{ id: 1, message_id: 1 }],
        },
      };
      const message = {
        conversation_id: 1,
        status: 'sent',
        id: 1,
      };

      mutations[types.DELETE_CONVERSATION_ATTACHMENTS](state, message);
      expect(state.attachments[1]).toHaveLength(0);
    });

    it('should not delete attachments for non-matching message id', () => {
      const state = {
        allConversations: [{ id: 1 }],
        attachments: {
          1: [{ id: 1, message_id: 1 }],
        },
      };
      const message = {
        conversation_id: 1,
        status: 'sent',
        id: 2,
      };

      mutations[types.DELETE_CONVERSATION_ATTACHMENTS](state, message);
      expect(state.attachments[1]).toHaveLength(1);
    });

    it('should not delete attachments if chat not found', () => {
      const state = {
        allConversations: [{ id: 1 }],
        attachments: { 1: [{ id: 1, message_id: 1 }] },
      };
      const message = {
        conversation_id: 2,
        status: 'sent',
        id: 1,
      };

      mutations[types.DELETE_CONVERSATION_ATTACHMENTS](state, message);
      expect(state.attachments[1]).toHaveLength(1);
    });
  });

  describe('#SET_CONTEXT_MENU_CHAT_ID', () => {
    it('sets the context menu chat id', () => {
      const state = { contextMenuChatId: 1 };
      mutations[types.SET_CONTEXT_MENU_CHAT_ID](state, 2);
      expect(state.contextMenuChatId).toEqual(2);
    });
  });

  describe('#SET_CHAT_LIST_FILTERS', () => {
    it('set chat list filters', () => {
      const conversationFilters = {
        inboxId: 1,
        assigneeType: 'me',
        status: 'open',
        sortBy: 'created_at',
        page: 1,
        labels: ['label'],
        teamId: 1,
        conversationType: 'mention',
      };
      const state = { conversationFilters: conversationFilters };
      mutations[types.SET_CHAT_LIST_FILTERS](state, conversationFilters);
      expect(state.conversationFilters).toEqual(conversationFilters);
    });
  });

  describe('#UPDATE_CHAT_LIST_FILTERS', () => {
    it('update chat list filters', () => {
      const conversationFilters = {
        inboxId: 1,
        assigneeType: 'me',
        status: 'open',
        sortBy: 'created_at',
        page: 1,
        labels: ['label'],
        teamId: 1,
        conversationType: 'mention',
      };
      const state = { conversationFilters: conversationFilters };
      mutations[types.UPDATE_CHAT_LIST_FILTERS](state, {
        inboxId: 2,
        updatedWithin: 20,
        assigneeType: 'all',
      });
      expect(state.conversationFilters).toEqual({
        inboxId: 2,
        assigneeType: 'all',
        status: 'open',
        sortBy: 'created_at',
        page: 1,
        labels: ['label'],
        teamId: 1,
        conversationType: 'mention',
        updatedWithin: 20,
      });
    });
  });

  describe('#SET_INBOX_CAPTAIN_ASSISTANT', () => {
    it('set inbox captain assistant', () => {
      const state = { copilotAssistant: {} };
      const data = {
        assistant: {
          id: 1,
          name: 'Assistant',
          description: 'Assistant description',
        },
      };
      mutations[types.SET_INBOX_CAPTAIN_ASSISTANT](state, data);
      expect(state.copilotAssistant).toEqual(data.assistant);
    });
  });

  describe('#SET_CHAT_DATA_FETCHED', () => {
    it('should set dataFetched to true on the conversation by ID', () => {
      const state = {
        allConversations: [{ id: 1 }, { id: 2 }],
      };
      mutations[types.SET_CHAT_DATA_FETCHED](state, 1);
      expect(state.allConversations[0].dataFetched).toBe(true);
      expect(state.allConversations[1].dataFetched).toBeUndefined();
    });

    it('should do nothing if conversation is not found', () => {
      const state = { allConversations: [{ id: 1 }] };
      mutations[types.SET_CHAT_DATA_FETCHED](state, 999);
      expect(state.allConversations[0].dataFetched).toBeUndefined();
    });

    it('should survive the race: SET_ALL_CONVERSATION replaces the object, then SET_CHAT_DATA_FETCHED still works', () => {
      // 1. Initial state: conversation exists with dataFetched undefined
      const state = {
        allConversations: [{ id: 1, messages: [{ id: 'm1' }] }],
        selectedChatId: 1,
      };
      const originalRef = state.allConversations[0];

      // 2. Simulate SET_ALL_CONVERSATION replacing the object (WebSocket/polling)
      //    This copies dataFetched from the old object (still undefined)
      mutations[types.SET_ALL_CONVERSATION](state, [
        { id: 1, name: 'refreshed', messages: [{ id: 'm2' }] },
      ]);

      // The store now holds a NEW object, old reference is detached
      const newRef = state.allConversations[0];
      expect(newRef).not.toBe(originalRef);
      expect(newRef.dataFetched).toBeUndefined();

      // 3. SET_CHAT_DATA_FETCHED finds by ID — works on the current store object
      mutations[types.SET_CHAT_DATA_FETCHED](state, 1);
      expect(state.allConversations[0].dataFetched).toBe(true);

      // Old detached reference is unaffected
      expect(originalRef.dataFetched).toBeUndefined();
    });
  });

  describe('#SET_ALL_MESSAGES_LOADED', () => {
    it('should set allMessagesLoaded to true on the conversation by ID', () => {
      const state = {
        allConversations: [{ id: 1, allMessagesLoaded: false }, { id: 2 }],
      };
      mutations[types.SET_ALL_MESSAGES_LOADED](state, 1);
      expect(state.allConversations[0].allMessagesLoaded).toBe(true);
      expect(state.allConversations[1].allMessagesLoaded).toBeUndefined();
    });

    it('should do nothing if conversation is not found', () => {
      const state = { allConversations: [{ id: 1 }] };
      mutations[types.SET_ALL_MESSAGES_LOADED](state, 999);
      expect(state.allConversations[0].allMessagesLoaded).toBeUndefined();
    });
  });

  describe('#CLEAR_ALL_MESSAGES_LOADED', () => {
    it('should set allMessagesLoaded to false on the conversation by ID', () => {
      const state = {
        allConversations: [
          { id: 1, allMessagesLoaded: true },
          { id: 2, allMessagesLoaded: true },
        ],
      };
      mutations[types.CLEAR_ALL_MESSAGES_LOADED](state, 1);
      expect(state.allConversations[0].allMessagesLoaded).toBe(false);
      expect(state.allConversations[1].allMessagesLoaded).toBe(true);
    });

    it('should do nothing if conversation is not found', () => {
      const state = { allConversations: [{ id: 1, allMessagesLoaded: true }] };
      mutations[types.CLEAR_ALL_MESSAGES_LOADED](state, 999);
      expect(state.allConversations[0].allMessagesLoaded).toBe(true);
    });
  });

  describe('#SET_PREVIOUS_CONVERSATIONS', () => {
    it('should prepend messages to conversation messages array', () => {
      const state = {
        allConversations: [{ id: 1, messages: [{ id: 'msg2' }] }],
      };
      const payload = { id: 1, data: [{ id: 'msg1' }] };

      mutations[types.SET_PREVIOUS_CONVERSATIONS](state, payload);
      expect(state.allConversations[0].messages).toEqual([
        { id: 'msg1' },
        { id: 'msg2' },
      ]);
    });

    it('should not modify messages if data is empty', () => {
      const state = {
        allConversations: [{ id: 1, messages: [{ id: 'msg2' }] }],
      };
      const payload = { id: 1, data: [] };

      mutations[types.SET_PREVIOUS_CONVERSATIONS](state, payload);
      expect(state.allConversations[0].messages).toEqual([{ id: 'msg2' }]);
    });
  });

  describe('#SET_MISSING_MESSAGES', () => {
    it('should replace message array with new data', () => {
      const state = {
        allConversations: [{ id: 1, messages: [{ id: 'old' }] }],
      };
      const payload = { id: 1, data: [{ id: 'new' }] };

      mutations[types.SET_MISSING_MESSAGES](state, payload);
      expect(state.allConversations[0].messages).toEqual([{ id: 'new' }]);
    });

    it('should do nothing if conversation is not found', () => {
      const state = {
        allConversations: [],
      };
      const payload = { id: 1, data: [{ id: 'new' }] };

      mutations[types.SET_MISSING_MESSAGES](state, payload);
      expect(state.allConversations).toEqual([]);
    });
  });

  describe('#ASSIGN_AGENT', () => {
    it('should assign agent to the correct conversation by ID', () => {
      const assignee = { id: 1, name: 'Agent' };
      const state = {
        allConversations: [
          { id: 1, meta: {} },
          { id: 2, meta: {} },
        ],
        selectedChatId: 2,
      };

      mutations[types.ASSIGN_AGENT](state, {
        conversationId: 1,
        assignee,
        assigneeType: 'AgentBot',
      });
      expect(state.allConversations[0].meta.assignee).toEqual(assignee);
      expect(state.allConversations[0].meta.assignee_type).toEqual('AgentBot');
      expect(state.allConversations[1].meta.assignee).toBeUndefined();
    });

    it('should update assignee type when provided', () => {
      const assignee = { id: 1, name: 'Agent' };
      const state = {
        allConversations: [{ id: 1, meta: { assignee_type: 'AgentBot' } }],
      };

      mutations[types.ASSIGN_AGENT](state, {
        conversationId: 1,
        assignee,
        assigneeType: 'User',
      });

      expect(state.allConversations[0].meta.assignee_type).toEqual('User');
    });

    it('should infer user assignee type when assignee type is omitted', () => {
      const assignee = { id: 1, name: 'Agent' };
      const state = {
        allConversations: [{ id: 1, meta: { assignee_type: 'AgentBot' } }],
      };

      mutations[types.ASSIGN_AGENT](state, {
        conversationId: 1,
        assignee,
      });

      expect(state.allConversations[0].meta.assignee_type).toEqual('User');
    });

    it('should clear assignee type when assignee type and assignee are omitted', () => {
      const state = {
        allConversations: [{ id: 1, meta: { assignee_type: 'AgentBot' } }],
      };

      mutations[types.ASSIGN_AGENT](state, {
        conversationId: 1,
        assignee: null,
      });

      expect(state.allConversations[0].meta.assignee_type).toBeNull();
    });
  });

  describe('#ASSIGN_PRIORITY', () => {
    it('should assign priority to conversation', () => {
      const priority = { title: 'Urgent', value: 'urgent' };
      const state = {
        allConversations: [{ id: 1 }],
      };

      mutations[types.ASSIGN_PRIORITY](state, {
        priority,
        conversationId: 1,
      });
      expect(state.allConversations[0].priority).toEqual(priority);
    });
  });

  describe('#MUTE_CONVERSATION', () => {
    it('should mute selected conversation', () => {
      const state = {
        allConversations: [{ id: 1, muted: false }],
        selectedChatId: 1,
      };

      mutations[types.MUTE_CONVERSATION](state);
      expect(state.allConversations[0].muted).toBe(true);
    });
  });

  describe('#UNMUTE_CONVERSATION', () => {
    it('should unmute selected conversation', () => {
      const state = {
        allConversations: [{ id: 1, muted: true }],
        selectedChatId: 1,
      };

      mutations[types.UNMUTE_CONVERSATION](state);
      expect(state.allConversations[0].muted).toBe(false);
    });
  });

  describe('#UPDATE_CONVERSATION', () => {
    it('should update existing conversation', () => {
      const state = {
        allConversations: [
          {
            id: 1,
            status: 'open',
            updated_at: 100,
            messages: [{ id: 'msg1' }],
          },
        ],
      };

      const conversation = {
        id: 1,
        status: 'resolved',
        updated_at: 200,
        messages: [{ id: 'msg2' }],
      };

      mutations[types.UPDATE_CONVERSATION](state, conversation);
      expect(state.allConversations[0]).toEqual({
        id: 1,
        status: 'resolved',
        updated_at: 200,
        messages: [{ id: 'msg1' }],
      });
    });

    it('does not insert an absent conversation on a normal view', () => {
      const state = {
        allConversations: [],
        conversationFilters: {},
      };

      const conversation = {
        id: 1,
        status: 'open',
      };

      mutations[types.UPDATE_CONVERSATION](state, conversation);
      // Security invariant: an ActionCable payload may never create an unknown conversation.
      // Insertion belongs to the authorized fetch path only.
      expect(state.allConversations).toEqual([]);
    });

    it('should not add conversation if not found on participating view', () => {
      const state = {
        allConversations: [],
        conversationFilters: { conversationType: 'participating' },
      };

      const conversation = {
        id: 1,
        status: 'open',
      };

      mutations[types.UPDATE_CONVERSATION](state, conversation);
      expect(state.allConversations).toEqual([]);
    });

    it('should not add conversation if not found on mention view', () => {
      const state = {
        allConversations: [],
        conversationFilters: { conversationType: 'mention' },
      };

      const conversation = {
        id: 1,
        status: 'open',
      };

      mutations[types.UPDATE_CONVERSATION](state, conversation);
      expect(state.allConversations).toEqual([]);
    });

    it('does not insert an absent conversation on an unattended view', () => {
      const state = {
        allConversations: [],
        conversationFilters: { conversationType: 'unattended' },
      };

      mutations[types.UPDATE_CONVERSATION](state, { id: 1, status: 'open' });
      expect(state.allConversations).toEqual([]);
    });

    it('should emit events if updating selected conversation', () => {
      const state = {
        allConversations: [
          {
            id: 1,
            status: 'open',
            updated_at: 100,
          },
        ],
        selectedChatId: 1,
      };

      const conversation = {
        id: 1,
        status: 'resolved',
        updated_at: 200,
      };

      mutations[types.UPDATE_CONVERSATION](state, conversation);
      expect(emitter.emit).toHaveBeenCalledWith('SCROLL_TO_MESSAGE');
    });

    it('should ignore updates with older timestamps', () => {
      const state = {
        allConversations: [
          {
            id: 1,
            status: 'open',
            updated_at: 200,
          },
        ],
      };

      const conversation = {
        id: 1,
        status: 'resolved',
        updated_at: 100,
      };

      mutations[types.UPDATE_CONVERSATION](state, conversation);
      expect(state.allConversations[0].status).toEqual('open');
    });

    it('should allow updates with same timestamps', () => {
      const state = {
        allConversations: [
          {
            id: 1,
            status: 'open',
            updated_at: 100,
          },
        ],
      };

      const conversation = {
        id: 1,
        status: 'resolved',
        updated_at: 100,
      };

      mutations[types.UPDATE_CONVERSATION](state, conversation);
      expect(state.allConversations[0].status).toEqual('resolved');
    });

    it('should preserve dataFetched and allMessagesLoaded during update', () => {
      const state = {
        allConversations: [
          {
            id: 1,
            status: 'open',
            updated_at: 100,
            messages: [{ id: 'msg1' }],
            dataFetched: true,
            allMessagesLoaded: true,
          },
        ],
      };

      const conversation = {
        id: 1,
        status: 'resolved',
        updated_at: 200,
        messages: [{ id: 'msg2' }],
      };

      mutations[types.UPDATE_CONVERSATION](state, conversation);
      expect(state.allConversations[0].status).toEqual('resolved');
      expect(state.allConversations[0].dataFetched).toBe(true);
      expect(state.allConversations[0].allMessagesLoaded).toBe(true);
      expect(state.allConversations[0].messages).toEqual([{ id: 'msg1' }]);
    });
  });

  describe('#UPDATE_CONVERSATION_CONTACT', () => {
    it('should update conversation contact data', () => {
      const state = {
        allConversations: [
          { id: 1, meta: { sender: { id: 1, name: 'Old Name' } } },
        ],
      };

      const payload = {
        conversationId: 1,
        id: 1,
        name: 'New Name',
      };

      mutations[types.UPDATE_CONVERSATION_CONTACT](state, payload);
      // The mutation extracts all properties except conversationId
      const { conversationId, ...contact } = payload;
      expect(state.allConversations[0].meta.sender).toEqual(contact);
    });

    it('should do nothing if conversation is not found', () => {
      const state = {
        allConversations: [],
      };

      const payload = {
        conversationId: 1,
        id: 1,
        name: 'New Name',
      };

      mutations[types.UPDATE_CONVERSATION_CONTACT](state, payload);
      expect(state.allConversations).toEqual([]);
    });
  });

  describe('#SET_ACTIVE_INBOX', () => {
    it('should set current inbox as integer', () => {
      const state = {
        currentInbox: null,
      };

      mutations[types.SET_ACTIVE_INBOX](state, '1');
      expect(state.currentInbox).toBe(1);
    });

    it('should set null if no inbox ID provided', () => {
      const state = {
        currentInbox: 1,
      };

      mutations[types.SET_ACTIVE_INBOX](state, null);
      expect(state.currentInbox).toBe(null);
    });
  });

  describe('#CLEAR_CONTACT_CONVERSATIONS', () => {
    it('should remove all conversations with matching contact ID', () => {
      const state = {
        allConversations: [
          { id: 1, meta: { sender: { id: 1 } } },
          { id: 2, meta: { sender: { id: 2 } } },
          { id: 3, meta: { sender: { id: 1 } } },
        ],
      };

      mutations[types.CLEAR_CONTACT_CONVERSATIONS](state, 1);
      expect(state.allConversations).toHaveLength(1);
      expect(state.allConversations[0].id).toBe(2);
    });
  });

  describe('#DELETE_CONVERSATION', () => {
    it('should delete a conversation', () => {
      const state = {
        allConversations: [{ id: 1, messages: [] }],
      };

      mutations[types.DELETE_CONVERSATION](state, 1);
      expect(state.allConversations).toEqual([]);
    });
  });

  describe('#SET_LIST_LOADING_STATUS', () => {
    it('should set listLoadingStatus to true', () => {
      const state = {
        listLoadingStatus: false,
      };

      mutations[types.SET_LIST_LOADING_STATUS](state);
      expect(state.listLoadingStatus).toBe(true);
    });
  });

  describe('#CLEAR_LIST_LOADING_STATUS', () => {
    it('should set listLoadingStatus to false', () => {
      const state = {
        listLoadingStatus: true,
      };

      mutations[types.CLEAR_LIST_LOADING_STATUS](state);
      expect(state.listLoadingStatus).toBe(false);
    });
  });

  describe('#CHANGE_CHAT_STATUS_FILTER', () => {
    it('should update chat status filter', () => {
      const state = {
        chatStatusFilter: 'open',
      };

      mutations[types.CHANGE_CHAT_STATUS_FILTER](state, 'resolved');
      expect(state.chatStatusFilter).toBe('resolved');
    });
  });

  describe('#UPDATE_ASSIGNEE', () => {
    it('should update assignee on conversation', () => {
      const state = {
        allConversations: [{ id: 1, meta: { assignee: null } }],
      };

      const payload = {
        id: 1,
        assignee: { id: 1, name: 'Agent' },
      };

      mutations[types.UPDATE_ASSIGNEE](state, payload);
      expect(state.allConversations[0].meta.assignee).toEqual(payload.assignee);
    });
  });

  describe('#SET_LAST_MESSAGE_ID_IN_SYNC_CONVERSATION', () => {
    it('should update the sync conversation message ID', () => {
      const state = {
        syncConversationsMessages: {},
      };

      mutations[types.SET_LAST_MESSAGE_ID_IN_SYNC_CONVERSATION](state, {
        conversationId: 1,
        messageId: 100,
      });

      expect(state.syncConversationsMessages[1]).toBe(100);
    });
  });
});

describe('#mutations - Phase 2A realtime contract', () => {
  describe('#ADD_MESSAGE ordering and activity', () => {
    it('orders out-of-order arrivals and keeps the newest as the preview', () => {
      const state = {
        allConversations: [{ id: 1, messages: [], last_activity_at: 0 }],
        selectedChatId: -1,
      };
      mutations[types.ADD_MESSAGE](state, {
        id: 102,
        conversation_id: 1,
        created_at: 1200,
        conversation: { last_activity_at: 1200 },
      });
      mutations[types.ADD_MESSAGE](state, {
        id: 101,
        conversation_id: 1,
        created_at: 1100,
        conversation: { last_activity_at: 1100 },
      });

      const chat = state.allConversations[0];
      expect(chat.messages.map(m => m.id)).toEqual([101, 102]);
      expect(chat.messages[chat.messages.length - 1].id).toBe(102);
      expect(chat.last_activity_at).toBe(1200);
      expect(chat.timestamp).toBe(1200);
    });

    it('never regresses activity when an older message arrives late', () => {
      const state = {
        allConversations: [
          {
            id: 1,
            messages: [{ id: 102, created_at: 1200 }],
            last_activity_at: 1200,
          },
        ],
        selectedChatId: -1,
      };
      mutations[types.ADD_MESSAGE](state, {
        id: 101,
        conversation_id: 1,
        created_at: 1100,
        conversation: { last_activity_at: 1100 },
      });
      expect(state.allConversations[0].last_activity_at).toBe(1200);
    });

    it('does not let an older duplicate overwrite the newest unread count', () => {
      const state = {
        allConversations: [{ id: 1, messages: [], last_activity_at: 0 }],
        selectedChatId: -1,
      };
      mutations[types.ADD_MESSAGE](state, {
        id: 102,
        conversation_id: 1,
        created_at: 1200,
        message_type: 0,
        conversation: { last_activity_at: 1200, unread_count: 7 },
      });
      mutations[types.ADD_MESSAGE](state, {
        id: 101,
        conversation_id: 1,
        created_at: 1100,
        message_type: 0,
        conversation: { last_activity_at: 1100, unread_count: 1 },
      });
      expect(state.allConversations[0].unread_count).toBe(7);
    });

    it('leaves activity, timestamp and unread untouched for an optimistic message', () => {
      const state = {
        allConversations: [
          {
            id: 1,
            messages: [],
            last_activity_at: 500,
            timestamp: 500,
            unread_count: 4,
          },
        ],
        selectedChatId: 1,
      };
      mutations[types.ADD_MESSAGE](state, {
        id: 'uuid-1',
        echo_id: 'uuid-1',
        status: 'progress',
        conversation_id: 1,
        created_at: 9999,
        message_type: 1,
      });
      const chat = state.allConversations[0];
      expect(chat.messages).toHaveLength(1);
      expect(chat.last_activity_at).toBe(500);
      expect(chat.timestamp).toBe(500);
      expect(chat.unread_count).toBe(4);
    });

    it('trims a non-selected row to five messages without implying completeness', () => {
      const state = {
        allConversations: [
          {
            id: 1,
            messages: [1, 2, 3, 4, 5].map(id => ({ id, created_at: id })),
            last_activity_at: 0,
          },
        ],
        selectedChatId: -1,
      };
      mutations[types.ADD_MESSAGE](state, {
        id: 6,
        conversation_id: 1,
        created_at: 6,
      });
      const chat = state.allConversations[0];
      expect(chat.messages).toHaveLength(5);
      expect(chat.messages.map(m => m.id)).toEqual([2, 3, 4, 5, 6]);
      expect(chat.allMessagesLoaded).toBeUndefined();
      expect(chat.dataFetched).toBeUndefined();
    });

    it('never trims the selected conversation', () => {
      const state = {
        allConversations: [
          {
            id: 1,
            messages: [1, 2, 3, 4, 5].map(id => ({ id, created_at: id })),
            last_activity_at: 0,
          },
        ],
        selectedChatId: 1,
      };
      mutations[types.ADD_MESSAGE](state, {
        id: 6,
        conversation_id: 1,
        created_at: 6,
      });
      expect(state.allConversations[0].messages).toHaveLength(6);
    });
  });

  describe('#ADD_MESSAGE incomingVersion collision signal', () => {
    const baseState = () => ({
      allConversations: [{ id: 1, messages: [], last_activity_at: 0 }],
      selectedChatId: -1,
    });

    it('increments for a genuinely new incoming public message', () => {
      const state = baseState();
      mutations[types.ADD_MESSAGE](state, {
        id: 1,
        conversation_id: 1,
        created_at: 10,
        message_type: 0,
      });
      expect(state.allConversations[0].incomingVersion).toBe(1);
    });

    it('does not increment for a duplicate cable event', () => {
      const state = baseState();
      const message = {
        id: 1,
        conversation_id: 1,
        created_at: 10,
        message_type: 0,
      };
      mutations[types.ADD_MESSAGE](state, message);
      mutations[types.ADD_MESSAGE](state, message);
      expect(state.allConversations[0].incomingVersion).toBe(1);
    });

    it('does not increment when a pending uuid is replaced by its server message', () => {
      const state = {
        allConversations: [
          {
            id: 1,
            last_activity_at: 0,
            messages: [
              {
                id: 'uuid-1',
                echo_id: 'uuid-1',
                status: 'progress',
                created_at: 10,
                message_type: 0,
              },
            ],
          },
        ],
        selectedChatId: -1,
      };
      mutations[types.ADD_MESSAGE](state, {
        id: 500,
        echo_id: 'uuid-1',
        conversation_id: 1,
        created_at: 10,
        message_type: 0,
        conversation: { unread_count: 9 },
      });
      const chat = state.allConversations[0];
      expect(chat.messages).toHaveLength(1);
      expect(chat.messages[0].id).toBe(500);
      // a replacement is not a genuinely new message
      expect(chat.incomingVersion).toBeUndefined();
      expect(chat.unread_count).toBeUndefined();
    });

    it('does not increment for outgoing, private or pending messages', () => {
      const state = baseState();
      mutations[types.ADD_MESSAGE](state, {
        id: 1,
        conversation_id: 1,
        created_at: 10,
        message_type: 1,
      });
      mutations[types.ADD_MESSAGE](state, {
        id: 2,
        conversation_id: 1,
        created_at: 11,
        message_type: 0,
        private: true,
      });
      mutations[types.ADD_MESSAGE](state, {
        id: 'uuid-1',
        echo_id: 'uuid-1',
        status: 'progress',
        conversation_id: 1,
        created_at: 12,
        message_type: 0,
      });
      expect(state.allConversations[0].incomingVersion).toBeUndefined();
    });
  });

  describe('#UPDATE_CONVERSATION tail-only message merge', () => {
    it('does not punch an older payload message into a loaded thread', () => {
      const state = {
        allConversations: [
          {
            id: 1,
            updated_at: 1,
            last_activity_at: 300,
            allMessagesLoaded: true,
            dataFetched: true,
            messages: [
              { id: 100, created_at: 100 },
              { id: 200, created_at: 200 },
            ],
          },
        ],
        selectedChatId: 1,
      };
      mutations[types.UPDATE_CONVERSATION](state, {
        id: 1,
        updated_at: 2,
        messages: [{ id: 150, created_at: 150 }],
      });
      const chat = state.allConversations[0];
      expect(chat.messages.map(m => m.id)).toEqual([100, 200]);
      expect(chat.allMessagesLoaded).toBe(true);
      expect(chat.dataFetched).toBe(true);
    });

    it('accepts a payload message that is newer than everything loaded', () => {
      const state = {
        allConversations: [
          {
            id: 1,
            updated_at: 1,
            last_activity_at: 200,
            messages: [{ id: 200, created_at: 200 }],
          },
        ],
        selectedChatId: 1,
      };
      mutations[types.UPDATE_CONVERSATION](state, {
        id: 1,
        updated_at: 2,
        last_activity_at: 300,
        messages: [{ id: 300, created_at: 300 }],
      });
      const chat = state.allConversations[0];
      expect(chat.messages.map(m => m.id)).toEqual([200, 300]);
      expect(chat.last_activity_at).toBe(300);
      expect(chat.timestamp).toBe(300);
    });

    it('keeps activity monotonic against an older payload', () => {
      const state = {
        allConversations: [{ id: 1, updated_at: 1, last_activity_at: 500 }],
        selectedChatId: -1,
      };
      mutations[types.UPDATE_CONVERSATION](state, {
        id: 1,
        updated_at: 2,
        last_activity_at: 100,
      });
      expect(state.allConversations[0].last_activity_at).toBe(500);
    });
  });

  describe('#UPSERT_CONVERSATION', () => {
    it('inserts an API-authorized conversation that is absent', () => {
      const state = { allConversations: [], selectedChatId: null };
      mutations[types.UPSERT_CONVERSATION](state, {
        id: 5,
        last_activity_at: 9,
      });
      expect(state.allConversations).toHaveLength(1);
      expect(state.allConversations[0].id).toBe(5);
    });

    it('merges under the freshness rules when already present', () => {
      const state = {
        allConversations: [
          { id: 5, last_activity_at: 900, updated_at: 900, messages: [] },
        ],
        selectedChatId: null,
      };
      mutations[types.UPSERT_CONVERSATION](state, {
        id: 5,
        last_activity_at: 100,
        updated_at: 100,
        messages: [],
      });
      expect(state.allConversations).toHaveLength(1);
      expect(state.allConversations[0].last_activity_at).toBe(900);
    });
  });
});

describe('#ADD_MESSAGE unread freshness with an optimistic tail', () => {
  // mergeMessagesById deliberately parks optimistic uuid rows AFTER every server message and
  // never sorts them, because their created_at comes from the browser clock. Unread freshness
  // must therefore be judged against the newest SERVER message, not the array tail.
  const stateWithOptimisticTail = clockSkew => ({
    allConversations: [
      {
        id: 1,
        last_activity_at: 1000,
        timestamp: 1000,
        unread_count: 0,
        messages: [
          { id: 100, created_at: 1000, message_type: 0 },
          {
            id: 'uuid-out',
            echo_id: 'uuid-out',
            status: 'progress',
            created_at: clockSkew,
            message_type: 1,
          },
        ],
      },
    ],
    selectedChatId: -1,
  });

  it.each([
    ['ahead of the server', 99999],
    ['behind the server', 1],
  ])(
    'applies the incoming unread count when the browser clock is %s',
    (_label, clockSkew) => {
      const state = stateWithOptimisticTail(clockSkew);

      mutations[types.ADD_MESSAGE](state, {
        id: 101,
        conversation_id: 1,
        created_at: 1001,
        message_type: 0,
        conversation: { last_activity_at: 1001, unread_count: 3 },
      });

      const chat = state.allConversations[0];
      expect(chat.unread_count).toBe(3);
      expect(chat.incomingVersion).toBe(1);
      expect(chat.last_activity_at).toBe(1001);
      // the optimistic row is still parked at the tail, in insertion order
      expect(chat.messages[chat.messages.length - 1].id).toBe('uuid-out');
      expect(chat.messages.map(m => m.id)).toEqual([100, 101, 'uuid-out']);
    }
  );

  it('still ignores a genuinely older server message despite the optimistic tail', () => {
    const state = stateWithOptimisticTail(99999);
    state.allConversations[0].unread_count = 5;

    mutations[types.ADD_MESSAGE](state, {
      id: 99,
      conversation_id: 1,
      created_at: 999,
      message_type: 0,
      conversation: { last_activity_at: 999, unread_count: 1 },
    });

    const chat = state.allConversations[0];
    expect(chat.unread_count).toBe(5);
    expect(chat.incomingVersion).toBeUndefined();
  });
});

describe('#EMPTY_ALL_CONVERSATION listGeneration', () => {
  it('increments the list generation so in-flight page responses are invalidated', () => {
    const state = {
      allConversations: [{ id: 1 }],
      selectedChatId: 1,
      listGeneration: 0,
    };
    mutations[types.EMPTY_ALL_CONVERSATION](state);
    expect(state.allConversations).toEqual([]);
    expect(state.selectedChatId).toBeNull();
    expect(state.listGeneration).toBe(1);
    mutations[types.EMPTY_ALL_CONVERSATION](state);
    expect(state.listGeneration).toBe(2);
  });

  it('is the only mutation that changes the list generation', () => {
    const state = {
      allConversations: [{ id: 1, messages: [] }],
      selectedChatId: -1,
      listGeneration: 5,
    };
    mutations[types.ADD_MESSAGE](state, {
      id: 1,
      conversation_id: 1,
      created_at: 1,
    });
    mutations[types.UPDATE_CONVERSATION](state, { id: 1, updated_at: 2 });
    mutations[types.UPSERT_CONVERSATION](state, { id: 2 });
    mutations[types.SET_ALL_CONVERSATION](state, [{ id: 3 }]);
    expect(state.listGeneration).toBe(5);
  });
});

describe('#viewMembership for Mentions / Participating rendering', () => {
  it('accumulates ids for a view without dropping earlier pages', () => {
    const state = {
      viewMembership: { mention: new Set([1]), participating: new Set() },
    };
    mutations[types.SET_CONVERSATION_VIEW_MEMBERSHIP](state, {
      view: 'mention',
      ids: [2, 3],
    });
    expect([...state.viewMembership.mention]).toEqual([1, 2, 3]);
    expect([...state.viewMembership.participating]).toEqual([]);
  });

  it('is cleared by the normal list reset', () => {
    const state = {
      allConversations: [{ id: 1 }],
      selectedChatId: 1,
      listGeneration: 0,
      viewMembership: { mention: new Set([1, 2]), participating: new Set([3]) },
    };
    mutations[types.EMPTY_ALL_CONVERSATION](state);
    expect([...state.viewMembership.mention]).toEqual([]);
    expect([...state.viewMembership.participating]).toEqual([]);
  });
});
