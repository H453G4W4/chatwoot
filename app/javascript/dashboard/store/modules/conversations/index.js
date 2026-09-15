import types from '../../mutation-types';
import getters, { getSelectedChatConversation } from './getters';
import actions from './actions';
import {
  findMessageIndexByIdentity,
  isNewerMessage,
  isNumericMessageId,
  mergeConversation,
  mergeMessagesById,
  LIST_MESSAGE_KEEP_COUNT,
} from './helpers';
import { MESSAGE_STATUS, MESSAGE_TYPE } from 'shared/constants/messages';
import wootConstants from 'dashboard/constants/globals';
import { BUS_EVENTS } from '../../../../shared/constants/busEvents';
import { emitter } from 'shared/helpers/mitt';
import { CONTENT_TYPES } from 'dashboard/components-next/message/constants.js';

const state = {
  allConversations: [],
  attachments: {},
  listLoadingStatus: true,
  chatStatusFilter: wootConstants.STATUS_TYPE.OPEN,
  chatSortFilter: wootConstants.SORT_BY_TYPE.LATEST,
  currentInbox: null,
  selectedChatId: null,
  appliedFilters: [],
  contextMenuChatId: null,
  conversationParticipants: [],
  conversationLastSeen: null,
  syncConversationsMessages: {},
  conversationFilters: {},
  copilotAssistant: {},
};

const getConversationById = _state => conversationId => {
  return _state.allConversations.find(c => c.id === conversationId);
};

// mutations
export const mutations = {
  [types.SET_ALL_CONVERSATION](_state, conversationList) {
    const newAllConversations = [..._state.allConversations];
    conversationList.forEach(conversation => {
      const indexInCurrentList = newAllConversations.findIndex(
        c => c.id === conversation.id
      );
      if (indexInCurrentList < 0) {
        newAllConversations.push(conversation);
      } else {
        // A page response can be older than realtime state that already landed, so the merge
        // decides per field instead of replacing wholesale.
        newAllConversations[indexInCurrentList] = mergeConversation(
          newAllConversations[indexInCurrentList],
          conversation,
          { isSelected: conversation.id === _state.selectedChatId }
        );
      }
    });
    _state.allConversations = newAllConversations;
  },
  [types.EMPTY_ALL_CONVERSATION](_state) {
    _state.allConversations = [];
    _state.selectedChatId = null;
  },
  [types.SET_ALL_MESSAGES_LOADED](_state, conversationId) {
    const chat = getConversationById(_state)(conversationId);
    if (chat) {
      chat.allMessagesLoaded = true;
    }
  },

  [types.CLEAR_ALL_MESSAGES_LOADED](_state, conversationId) {
    const chat = getConversationById(_state)(conversationId);
    if (chat) {
      chat.allMessagesLoaded = false;
    }
  },
  [types.CLEAR_CURRENT_CHAT_WINDOW](_state) {
    _state.selectedChatId = null;
  },

  [types.SET_PREVIOUS_CONVERSATIONS](_state, { id, data }) {
    if (data.length) {
      const [chat] = _state.allConversations.filter(c => c.id === id);
      chat.messages.unshift(...data);
    }
  },
  [types.SET_ALL_ATTACHMENTS](_state, { id, data }) {
    _state.attachments[id] = [...data];
  },
  [types.SET_MISSING_MESSAGES](_state, { id, data }) {
    const [chat] = _state.allConversations.filter(c => c.id === id);
    if (!chat) return;
    chat.messages = data;
  },

  [types.SET_CHAT_DATA_FETCHED](_state, conversationId) {
    const chat = getConversationById(_state)(conversationId);
    if (chat) {
      chat.dataFetched = true;
    }
  },

  [types.SET_CURRENT_CHAT_WINDOW](_state, activeChat) {
    if (activeChat) {
      _state.selectedChatId = activeChat.id;
    }
  },

  [types.ASSIGN_AGENT](_state, { conversationId, assignee, assigneeType }) {
    const chat = getConversationById(_state)(conversationId);
    if (chat) {
      chat.meta.assignee = assignee;
      const inferredAssigneeType = assignee ? 'User' : null;
      chat.meta.assignee_type =
        assigneeType === undefined ? inferredAssigneeType : assigneeType;
    }
  },

  [types.ASSIGN_TEAM](_state, { team, conversationId }) {
    const [chat] = _state.allConversations.filter(c => c.id === conversationId);
    chat.meta.team = team;
  },

  [types.UPDATE_CONVERSATION_LAST_ACTIVITY](
    _state,
    { lastActivityAt, conversationId }
  ) {
    const [chat] = _state.allConversations.filter(c => c.id === conversationId);
    if (!chat) return;
    // Broadcasts are independent jobs with no ordering guarantee, so activity only ever rises.
    const nextActivity = Math.max(
      Number(chat.last_activity_at ?? 0),
      Number(lastActivityAt ?? 0)
    );
    if (!nextActivity) return;
    chat.last_activity_at = nextActivity;
    chat.timestamp = nextActivity;
  },
  [types.ASSIGN_PRIORITY](_state, { priority, conversationId }) {
    const [chat] = _state.allConversations.filter(c => c.id === conversationId);
    chat.priority = priority;
  },

  [types.UPDATE_CONVERSATION_CUSTOM_ATTRIBUTES](
    _state,
    { conversationId, customAttributes }
  ) {
    const conversation = _state.allConversations.find(
      c => c.id === conversationId
    );
    if (conversation) {
      conversation.custom_attributes = {
        ...conversation.custom_attributes,
        ...customAttributes,
      };
    }
  },

  [types.CHANGE_CONVERSATION_STATUS](
    _state,
    { conversationId, status, snoozedUntil }
  ) {
    const conversation =
      getters.getConversationById(_state)(conversationId) || {};
    conversation.snoozed_until = snoozedUntil;
    conversation.status = status;
  },

  [types.MUTE_CONVERSATION](_state) {
    const [chat] = getSelectedChatConversation(_state);
    chat.muted = true;
  },

  [types.UNMUTE_CONVERSATION](_state) {
    const [chat] = getSelectedChatConversation(_state);
    chat.muted = false;
  },

  [types.ADD_CONVERSATION_ATTACHMENTS](_state, message) {
    // early return if the message has not been sent, or has no attachments
    if (
      message.status !== MESSAGE_STATUS.SENT ||
      !message.attachments?.length
    ) {
      return;
    }

    const id = message.conversation_id;
    const existingAttachments = _state.attachments[id] || [];

    const attachmentsToAdd = message.attachments.filter(attachment => {
      // if the attachment is not already in the store, add it
      // this is to prevent duplicates
      return !existingAttachments.some(
        existingAttachment => existingAttachment.id === attachment.id
      );
    });

    // replace the attachments in the store
    _state.attachments[id] = [...existingAttachments, ...attachmentsToAdd];
  },

  [types.DELETE_CONVERSATION_ATTACHMENTS](_state, message) {
    if (message.status !== MESSAGE_STATUS.SENT) return;

    const { conversation_id: id } = message;
    const existingAttachments = _state.attachments[id] || [];
    if (!existingAttachments.length) return;

    _state.attachments[id] = existingAttachments.filter(attachment => {
      return attachment.message_id !== message.id;
    });
  },

  [types.ADD_MESSAGE]({ allConversations, selectedChatId }, message) {
    const { conversation_id: conversationId } = message;
    const [chat] = getSelectedChatConversation({
      allConversations,
      selectedChatId: conversationId,
    });
    // An unknown conversation is never created here. The authorized fetch path owns insertion.
    if (!chat) return;

    const existingMessages = chat.messages || [];
    // mergeMessagesById parks optimistic uuid rows after every server message and never sorts
    // them, so the array tail can be an optimistic row timed by the browser clock. Unread
    // freshness is judged against the newest SERVER message, otherwise a clock running ahead
    // would suppress the unread count of a genuinely new customer message.
    const serverMessages = existingMessages.filter(m =>
      isNumericMessageId(m.id)
    );
    const latest = serverMessages[serverMessages.length - 1];
    const alreadyKnown =
      findMessageIndexByIdentity(existingMessages, message) !== -1;
    const isPending =
      message.status === MESSAGE_STATUS.PROGRESS &&
      message.id === message.echo_id;
    const keep =
      chat.id === selectedChatId ? undefined : LIST_MESSAGE_KEEP_COUNT;

    chat.messages = mergeMessagesById(existingMessages, [message], { keep });

    if (!alreadyKnown && selectedChatId === conversationId) {
      emitter.emit(BUS_EVENTS.SCROLL_TO_MESSAGE);
    }

    // An optimistic row is timed by the browser clock, which is not server truth.
    if (isPending) return;

    const activity = Number(
      message.conversation?.last_activity_at ?? message.created_at ?? 0
    );
    const nextActivity = Math.max(Number(chat.last_activity_at ?? 0), activity);
    if (nextActivity) {
      chat.last_activity_at = nextActivity;
      chat.timestamp = nextActivity;
    }

    const isGenuinelyNew = !alreadyKnown && isNewerMessage(message, latest);

    // Collision signal consumed by the Phase 2D read-state reconciliation. It must count only
    // genuinely new incoming public messages - never duplicates, replacements, pending rows,
    // outgoing messages or private notes.
    if (
      isGenuinelyNew &&
      message.message_type === MESSAGE_TYPE.INCOMING &&
      !message.private
    ) {
      chat.incomingVersion = (chat.incomingVersion ?? 0) + 1;
    }

    // Unread is never derived arithmetically. Accept the server's count only when this really
    // is the newest message, so a late or duplicate event cannot resurrect a stale count.
    if (
      isGenuinelyNew &&
      message.conversation &&
      'unread_count' in message.conversation
    ) {
      chat.unread_count = message.conversation.unread_count;
    }
  },

  [types.DELETE_CONVERSATION](_state, conversationId) {
    _state.allConversations = _state.allConversations.filter(
      c => c.id !== conversationId
    );
  },

  [types.UPDATE_CONVERSATION](_state, conversation) {
    const { allConversations } = _state;
    const index = allConversations.findIndex(c => c.id === conversation.id);

    // Update only. An ActionCable payload may never create an unknown conversation - that is
    // the job of ensureAuthorizedConversation, which authorizes through the API first. The old
    // push-when-absent branch and its mention/participating gate are gone with it.
    if (index < 0) return;

    const existing = allConversations[index];

    // ignore out of order events
    if (conversation.updated_at < existing.updated_at) {
      return;
    }

    const { messages: payloadMessages = [], ...updates } = conversation;
    const merged = { ...existing, ...updates };

    // Tail-only merge: a conversation payload carries just the last public message, so accept
    // it only when it is newer than everything loaded. Never punch a hole into an open thread,
    // and never imply the history is complete.
    const existingMessages = existing.messages || [];
    const maxNumericId = existingMessages.reduce(
      (max, m) =>
        isNumericMessageId(m.id) && Number(m.id) > max ? Number(m.id) : max,
      0
    );
    const tailMessages = payloadMessages.filter(
      m => isNumericMessageId(m.id) && Number(m.id) > maxNumericId
    );
    const keep =
      conversation.id === _state.selectedChatId
        ? undefined
        : LIST_MESSAGE_KEEP_COUNT;
    merged.messages = tailMessages.length
      ? mergeMessagesById(existingMessages, tailMessages, { keep })
      : existingMessages;
    merged.allMessagesLoaded = existing.allMessagesLoaded;
    merged.dataFetched = existing.dataFetched;

    const nextActivity = Math.max(
      Number(existing.last_activity_at ?? 0),
      Number(conversation.last_activity_at ?? 0)
    );
    if (nextActivity) {
      merged.last_activity_at = nextActivity;
      merged.timestamp = nextActivity;
    }

    allConversations[index] = merged;
    if (_state.selectedChatId === conversation.id) {
      emitter.emit(BUS_EVENTS.SCROLL_TO_MESSAGE);
    }
  },

  [types.UPSERT_CONVERSATION](_state, conversation) {
    // The only realtime insertion path. Reached exclusively from upsertFetchedConversation,
    // whose payload came from an authenticated ConversationApi.show. No LRU eviction: a row
    // here may equally belong to a page the agent has already scrolled through.
    const index = _state.allConversations.findIndex(
      c => c.id === conversation.id
    );
    if (index < 0) {
      _state.allConversations.push(conversation);
      return;
    }
    _state.allConversations[index] = mergeConversation(
      _state.allConversations[index],
      conversation,
      { isSelected: conversation.id === _state.selectedChatId }
    );
  },

  [types.SET_LIST_LOADING_STATUS](_state) {
    _state.listLoadingStatus = true;
  },

  [types.CLEAR_LIST_LOADING_STATUS](_state) {
    _state.listLoadingStatus = false;
  },

  [types.UPDATE_MESSAGE_UNREAD_COUNT](
    _state,
    { id, lastSeen, unreadCount = 0 }
  ) {
    const [chat] = _state.allConversations.filter(c => c.id === id);
    if (chat) {
      chat.agent_last_seen_at = lastSeen;
      chat.unread_count = unreadCount;
    }
  },
  [types.CHANGE_CHAT_STATUS_FILTER](_state, data) {
    _state.chatStatusFilter = data;
  },

  [types.CHANGE_CHAT_SORT_FILTER](_state, data) {
    _state.chatSortFilter = data;
  },

  // Update assignee on action cable message
  [types.UPDATE_ASSIGNEE](_state, payload) {
    const chat = getConversationById(_state)(payload.id);
    if (chat) {
      chat.meta.assignee = payload.assignee;
    }
  },

  [types.UPDATE_CONVERSATION_CONTACT](_state, { conversationId, ...payload }) {
    const [chat] = _state.allConversations.filter(c => c.id === conversationId);
    if (chat) {
      chat.meta.sender = payload;
    }
  },

  [types.UPDATE_MESSAGE_CALL_STATUS](
    _state,
    { conversationId, callStatus, callSid }
  ) {
    const chat = getConversationById(_state)(conversationId);
    if (!chat) return;

    const message = (chat.messages || []).find(
      m =>
        m.content_type === CONTENT_TYPES.VOICE_CALL &&
        m.call?.provider_call_id === callSid
    );
    if (!message?.call) return;

    message.call = { ...message.call, status: callStatus };
  },

  [types.SET_ACTIVE_INBOX](_state, inboxId) {
    _state.currentInbox = inboxId ? parseInt(inboxId, 10) : null;
  },

  [types.SET_CONVERSATION_CAN_REPLY](_state, { conversationId, canReply }) {
    const [chat] = _state.allConversations.filter(c => c.id === conversationId);
    if (chat) {
      chat.can_reply = canReply;
    }
  },

  [types.CLEAR_CONTACT_CONVERSATIONS](_state, contactId) {
    const chats = _state.allConversations.filter(
      c => c.meta.sender.id !== contactId
    );
    _state.allConversations = chats;
  },

  [types.SET_CONVERSATION_FILTERS](_state, data) {
    _state.appliedFilters = data;
  },

  [types.CLEAR_CONVERSATION_FILTERS](_state) {
    _state.appliedFilters = [];
  },

  [types.SET_LAST_MESSAGE_ID_IN_SYNC_CONVERSATION](
    _state,
    { conversationId, messageId }
  ) {
    _state.syncConversationsMessages[conversationId] = messageId;
  },

  [types.SET_CONTEXT_MENU_CHAT_ID](_state, chatId) {
    _state.contextMenuChatId = chatId;
  },

  [types.SET_CHAT_LIST_FILTERS](_state, data) {
    _state.conversationFilters = data;
  },
  [types.UPDATE_CHAT_LIST_FILTERS](_state, data) {
    _state.conversationFilters = { ..._state.conversationFilters, ...data };
  },
  [types.SET_INBOX_CAPTAIN_ASSISTANT](_state, data) {
    _state.copilotAssistant = data.assistant;
  },
};

export default {
  state,
  getters,
  actions,
  mutations,
};
