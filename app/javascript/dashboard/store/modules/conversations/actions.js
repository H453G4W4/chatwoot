import types from '../../mutation-types';
import ConversationApi from '../../../api/inbox/conversation';
import MessageApi from '../../../api/inbox/message';
import { MESSAGE_STATUS, MESSAGE_TYPE } from 'shared/constants/messages';
import { createPendingMessage } from 'dashboard/helper/commons';
import {
  buildConversationList,
  isOnMentionsView,
  isOnUnattendedView,
} from './helpers/actionHelpers';
import { compareMessages } from './helpers';
import {
  bufferConversationPayload,
  bufferMessage,
  createInflightEntry,
  getAccountGeneration,
  inflightFetches,
  realtimeKey,
  scheduleFetch,
} from './realtimeState';
import messageReadActions from './actions/messageReadActions';
import messageTranslateActions from './actions/messageTranslateActions';
import * as Sentry from '@sentry/vue';
import {
  handleVoiceCallCreated,
  handleVoiceCallUpdated,
  syncConversationCallVisibility,
} from 'dashboard/helper/voice';

export const hasMessageFailedWithExternalError = pendingMessage => {
  // This helper is used to check if the message has failed with an external error.
  // We have two cases
  // 1. Messages that fail from the UI itself (due to large attachments or a failed network):
  //    In this case, the message will have a status of failed but no external error. So we need to create that message again
  // 2. Messages sent from Chatwoot but failed to deliver to the customer for some reason (user blocking or client system down):
  //    In this case, the message will have a status of failed and an external error. So we need to retry that message
  const { content_attributes: contentAttributes, status } = pendingMessage;
  const externalError = contentAttributes?.external_error ?? '';
  return status === MESSAGE_STATUS.FAILED && externalError !== '';
};

// actions
const actions = {
  getConversation: async ({ dispatch }, conversationId) => {
    try {
      const response = await ConversationApi.show(conversationId);
      // Deep links insert through the same authorized upsert as the realtime fetch path.
      // Deliberately not scheduled: this is one request per navigation, not an amplification
      // source, and it must not be delayed by the realtime debounce.
      dispatch('upsertFetchedConversation', response.data);
    } catch (error) {
      // Ignore error
    }
  },

  upsertFetchedConversation({ commit, dispatch }, data) {
    commit(types.UPSERT_CONVERSATION, data);
    const sender = data.meta?.sender;
    if (sender) commit(`contacts/${types.SET_CONTACT_ITEM}`, sender);
    dispatch('conversationLabels/setConversationLabel', {
      id: data.id,
      data: data.labels,
    });
  },

  /**
   * The only way a conversation the store has never seen can enter allConversations.
   *
   * The backend is the sole authorization authority: an ActionCable payload may update an
   * entity that is already present, but may never create one - for any role, on any event,
   * from any route. There is no local permission pre-check and no negative cache of refusals.
   */
  ensureAuthorizedConversation(
    { dispatch, rootGetters },
    { conversationId, message, conversationPayload }
  ) {
    const accountId = rootGetters.getCurrentAccountId;
    const key = realtimeKey(accountId, conversationId);

    // Present already means the API authorized it earlier; re-authorizing every event would
    // be pointless traffic.
    if (rootGetters.getConversationById(conversationId)) {
      if (message) dispatch('addMessage', message);
      else if (conversationPayload)
        dispatch('updateConversation', conversationPayload);
      return;
    }

    // No view gate. The route the agent happens to be on must never lose a customer message.
    const existingEntry = inflightFetches.get(key);
    if (existingEntry) {
      if (message) bufferMessage(existingEntry, message);
      bufferConversationPayload(existingEntry, conversationPayload);
      scheduleFetch(key, existingEntry, existingEntry.runner);
      return;
    }

    const entry = createInflightEntry(accountId);
    if (message) bufferMessage(entry, message);
    bufferConversationPayload(entry, conversationPayload);
    inflightFetches.set(key, entry);

    const runner = () =>
      ConversationApi.show(conversationId)
        .then(({ data }) => {
          // display_id is unique only per account and ApiClient reads the account from the
          // URL, so ownership is asserted against the entry, the payload and the store.
          const valid =
            inflightFetches.get(key) === entry &&
            Number(data.account_id) === Number(entry.accountId) &&
            Number(rootGetters.getCurrentAccountId) ===
              Number(entry.accountId) &&
            entry.accountGeneration === getAccountGeneration();
          if (!valid) return;

          dispatch('upsertFetchedConversation', data);

          // The fetched copy is authoritative; a buffered payload applies only if newer.
          if (
            entry.conversationPayload &&
            Number(entry.conversationPayload.updated_at ?? 0) >
              Number(data.updated_at ?? 0)
          ) {
            dispatch('updateConversation', entry.conversationPayload);
          }

          [...entry.messageBuffer.values()]
            .sort(compareMessages)
            .forEach(bufferedMessage => {
              dispatch('addMessage', bufferedMessage);
              dispatch('updateConversationLastActivity', {
                conversationId,
                lastActivityAt:
                  bufferedMessage.conversation?.last_activity_at ??
                  bufferedMessage.created_at,
              });
            });
        })
        .catch(() => {
          // 401/403/404/5xx/network: insert nothing, retain nothing. A later event retries.
        })
        .finally(() => {
          // Only the current owner may remove the entry, so an older promise can never delete
          // a newer entry or its buffer.
          if (inflightFetches.get(key) === entry) inflightFetches.delete(key);
        });

    scheduleFetch(key, entry, runner);
  },

  bufferMessageUpdateIfFetching({ rootGetters }, message) {
    const key = realtimeKey(
      rootGetters.getCurrentAccountId,
      message.conversation_id
    );
    const entry = inflightFetches.get(key);
    // Refreshes a buffered message only; it never starts a fetch of its own.
    if (entry) bufferMessage(entry, message);
  },

  fetchAllConversations: async ({ commit, state, dispatch }) => {
    commit(types.SET_LIST_LOADING_STATUS);
    try {
      const params = state.conversationFilters;
      const {
        data: { data },
      } = await ConversationApi.get(params);
      buildConversationList(
        { commit, dispatch },
        params,
        data,
        params.assigneeType
      );
    } catch (error) {
      // Handle error
    }
  },

  fetchFilteredConversations: async ({ commit, dispatch }, params) => {
    commit(types.SET_LIST_LOADING_STATUS);
    try {
      const { data } = await ConversationApi.filter(params);
      buildConversationList(
        { commit, dispatch },
        params,
        data,
        'appliedFilters'
      );
    } catch (error) {
      commit(types.CLEAR_LIST_LOADING_STATUS);
      throw error;
    }
  },

  emptyAllConversations({ commit }) {
    commit(types.EMPTY_ALL_CONVERSATION);
  },

  clearSelectedState({ commit }) {
    commit(types.CLEAR_CURRENT_CHAT_WINDOW);
  },

  fetchPreviousMessages: async ({ commit }, data) => {
    try {
      const {
        data: { meta, payload },
      } = await MessageApi.getPreviousMessages(data);
      commit(`conversationMetadata/${types.SET_CONVERSATION_METADATA}`, {
        id: data.conversationId,
        data: meta,
      });
      commit(types.SET_PREVIOUS_CONVERSATIONS, {
        id: data.conversationId,
        data: payload,
      });
      if (!payload.length) {
        commit(types.SET_ALL_MESSAGES_LOADED, data.conversationId);
      }
    } catch (error) {
      // Handle error
    }
  },

  fetchAllAttachments: async ({ commit }, conversationId) => {
    let attachments = [];

    try {
      const { data } = await ConversationApi.getAllAttachments(conversationId);
      attachments = data.payload;
    } catch (error) {
      // in case of error, log the error and continue
      Sentry.setContext('Conversation', {
        id: conversationId,
      });
      Sentry.captureException(error);
    } finally {
      // we run the commit even if the request fails
      // this ensures that the `attachment` variable is always present on chat
      commit(types.SET_ALL_ATTACHMENTS, {
        id: conversationId,
        data: attachments,
      });
    }
  },

  syncActiveConversationMessages: async (
    { commit, state, dispatch },
    { conversationId }
  ) => {
    const { allConversations, syncConversationsMessages } = state;
    const lastMessageId = syncConversationsMessages[conversationId];
    const selectedChat = allConversations.find(
      conversation => conversation.id === conversationId
    );
    if (!selectedChat) return;
    try {
      const { messages } = selectedChat;
      // Fetch all the messages after the last message id
      const {
        data: { meta, payload },
      } = await MessageApi.getPreviousMessages({
        conversationId,
        after: lastMessageId,
      });
      commit(`conversationMetadata/${types.SET_CONVERSATION_METADATA}`, {
        id: conversationId,
        data: meta,
      });
      // Find the messages that are not already present in the store
      const missingMessages = payload.filter(
        message => !messages.find(item => item.id === message.id)
      );
      selectedChat.messages.push(...missingMessages);
      // Sort the messages by created_at
      const sortedMessages = selectedChat.messages.sort((a, b) => {
        return new Date(a.created_at) - new Date(b.created_at);
      });
      commit(types.SET_MISSING_MESSAGES, {
        id: conversationId,
        data: sortedMessages,
      });
      commit(types.SET_LAST_MESSAGE_ID_IN_SYNC_CONVERSATION, {
        conversationId,
        messageId: null,
      });
      dispatch('markMessagesRead', { id: conversationId }, { root: true });
    } catch (error) {
      // Handle error
    }
  },

  setConversationLastMessageId: async (
    { commit, state },
    { conversationId }
  ) => {
    const { allConversations } = state;
    const selectedChat = allConversations.find(
      conversation => conversation.id === conversationId
    );
    if (!selectedChat) return;
    const { messages } = selectedChat;
    const lastMessage = messages.last();
    if (!lastMessage) return;
    commit(types.SET_LAST_MESSAGE_ID_IN_SYNC_CONVERSATION, {
      conversationId,
      messageId: lastMessage.id,
    });
  },

  async setActiveChat({ commit, dispatch }, { data, after }) {
    commit(types.SET_CURRENT_CHAT_WINDOW, data);
    commit(types.CLEAR_ALL_MESSAGES_LOADED, data.id);
    if (data.dataFetched === undefined) {
      try {
        await dispatch('fetchPreviousMessages', {
          after,
          before: data.messages[0].id,
          conversationId: data.id,
        });
        commit(types.SET_CHAT_DATA_FETCHED, data.id);
      } catch (error) {
        // Ignore error
      }
    }
  },

  assignAgent: async (
    { dispatch },
    { conversationId, agentId, assigneeType }
  ) => {
    try {
      const response = await ConversationApi.assignAgent({
        conversationId,
        agentId,
        assigneeType,
      });
      dispatch('setCurrentChatAssignee', {
        conversationId,
        assignee: response.data,
        assigneeType,
      });
    } catch (error) {
      // Handle error
    }
  },

  setCurrentChatAssignee(
    { commit },
    { conversationId, assignee, assigneeType }
  ) {
    commit(types.ASSIGN_AGENT, { conversationId, assignee, assigneeType });
  },

  assignTeam: async ({ dispatch }, { conversationId, teamId }) => {
    try {
      const response = await ConversationApi.assignTeam({
        conversationId,
        teamId,
      });
      dispatch('setCurrentChatTeam', { team: response.data, conversationId });
    } catch (error) {
      // Handle error
    }
  },

  setCurrentChatTeam({ commit }, { team, conversationId }) {
    commit(types.ASSIGN_TEAM, { team, conversationId });
  },

  toggleStatus: async (
    { commit },
    { conversationId, status, snoozedUntil = null, customAttributes = null }
  ) => {
    try {
      // Update custom attributes first if provided
      if (customAttributes) {
        await ConversationApi.updateCustomAttributes({
          conversationId,
          customAttributes,
        });
        commit(types.UPDATE_CONVERSATION_CUSTOM_ATTRIBUTES, {
          conversationId,
          customAttributes,
        });
      }

      const {
        data: {
          payload: {
            current_status: updatedStatus,
            snoozed_until: updatedSnoozedUntil,
          } = {},
        } = {},
      } = await ConversationApi.toggleStatus({
        conversationId,
        status,
        snoozedUntil,
      });
      commit(types.CHANGE_CONVERSATION_STATUS, {
        conversationId,
        status: updatedStatus,
        snoozedUntil: updatedSnoozedUntil,
      });
    } catch (error) {
      // Handle error
    }
  },

  createPendingMessageAndSend: async ({ dispatch }, data) => {
    const pendingMessage = createPendingMessage(data);
    dispatch('sendMessageWithData', pendingMessage);
  },

  sendMessageWithData: async ({ commit }, pendingMessage) => {
    const { conversation_id: conversationId, id } = pendingMessage;
    try {
      commit(types.ADD_MESSAGE, {
        ...pendingMessage,
        status: MESSAGE_STATUS.PROGRESS,
      });
      const response = hasMessageFailedWithExternalError(pendingMessage)
        ? await MessageApi.retry(conversationId, id)
        : await MessageApi.create(pendingMessage);
      commit(types.ADD_MESSAGE, {
        ...response.data,
        status: MESSAGE_STATUS.SENT,
      });
      commit(types.ADD_CONVERSATION_ATTACHMENTS, {
        ...response.data,
        status: MESSAGE_STATUS.SENT,
      });
    } catch (error) {
      const errorMessage = error.response
        ? error.response.data.error
        : undefined;
      commit(types.ADD_MESSAGE, {
        ...pendingMessage,
        meta: {
          error: errorMessage,
        },
        status: MESSAGE_STATUS.FAILED,
      });
      throw error;
    }
  },

  addMessage({ commit, rootGetters }, message) {
    commit(types.ADD_MESSAGE, message);
    if (message.message_type === MESSAGE_TYPE.INCOMING) {
      commit(types.SET_CONVERSATION_CAN_REPLY, {
        conversationId: message.conversation_id,
        canReply: true,
      });
      commit(types.ADD_CONVERSATION_ATTACHMENTS, message);
    }
    handleVoiceCallCreated(
      message,
      rootGetters?.getCurrentUserID,
      rootGetters?.getCurrentUserAvailability
    );
  },

  updateMessage({ commit, rootGetters }, message) {
    commit(types.ADD_MESSAGE, message);
    handleVoiceCallUpdated(
      commit,
      message,
      rootGetters?.getCurrentUserID,
      rootGetters?.getCurrentUserAvailability
    );
  },

  deleteMessage: async function deleteLabels(
    { commit },
    { conversationId, messageId }
  ) {
    try {
      const { data } = await MessageApi.delete(conversationId, messageId);
      commit(types.ADD_MESSAGE, data);
      commit(types.DELETE_CONVERSATION_ATTACHMENTS, data);
    } catch (error) {
      throw new Error(error);
    }
  },

  deleteConversation: async ({ commit, dispatch }, conversationId) => {
    try {
      await ConversationApi.delete(conversationId);
      commit(types.DELETE_CONVERSATION, conversationId);
      dispatch('conversationStats/get', {}, { root: true });
    } catch (error) {
      throw new Error(error);
    }
  },

  addMentions({ dispatch, rootState }, conversation) {
    if (isOnMentionsView(rootState)) {
      dispatch('updateConversation', conversation);
    }
  },

  addUnattended({ dispatch, rootState }, conversation) {
    if (isOnUnattendedView(rootState)) {
      dispatch('updateConversation', conversation);
    }
  },

  updateConversation({ commit, dispatch, rootGetters }, conversation) {
    const sender = conversation.meta?.sender;

    commit(types.UPDATE_CONVERSATION, conversation);
    syncConversationCallVisibility(conversation, rootGetters?.getCurrentUserID);

    dispatch('conversationLabels/setConversationLabel', {
      id: conversation.id,
      data: conversation.labels,
    });

    if (sender) dispatch('contacts/setContact', sender);
  },

  updateConversationLastActivity(
    { commit },
    { conversationId, lastActivityAt }
  ) {
    commit(types.UPDATE_CONVERSATION_LAST_ACTIVITY, {
      lastActivityAt,
      conversationId,
    });
  },

  setChatStatusFilter({ commit }, data) {
    commit(types.CHANGE_CHAT_STATUS_FILTER, data);
  },

  setChatSortFilter({ commit }, data) {
    commit(types.CHANGE_CHAT_SORT_FILTER, data);
  },

  updateAssignee({ commit }, data) {
    commit(types.UPDATE_ASSIGNEE, data);
  },

  updateConversationContact({ commit }, data) {
    if (data.id) {
      commit(`contacts/${types.SET_CONTACT_ITEM}`, data);
    }
    commit(types.UPDATE_CONVERSATION_CONTACT, data);
  },

  setActiveInbox({ commit }, inboxId) {
    commit(types.SET_ACTIVE_INBOX, inboxId);
  },

  muteConversation: async ({ commit }, conversationId) => {
    try {
      await ConversationApi.mute(conversationId);
      commit(types.MUTE_CONVERSATION);
    } catch (error) {
      //
    }
  },

  unmuteConversation: async ({ commit }, conversationId) => {
    try {
      await ConversationApi.unmute(conversationId);
      commit(types.UNMUTE_CONVERSATION);
    } catch (error) {
      //
    }
  },

  sendEmailTranscript: async (_, { conversationId, email }) => {
    await ConversationApi.sendEmailTranscript({ conversationId, email });
  },

  updateCustomAttributes: async (
    { commit },
    { conversationId, customAttributes }
  ) => {
    try {
      const response = await ConversationApi.updateCustomAttributes({
        conversationId,
        customAttributes,
      });
      const { custom_attributes } = response.data;
      commit(types.UPDATE_CONVERSATION_CUSTOM_ATTRIBUTES, {
        conversationId,
        customAttributes: custom_attributes,
      });
    } catch (error) {
      throw new Error(error);
    }
  },

  setConversationFilters({ commit }, data) {
    commit(types.SET_CONVERSATION_FILTERS, data);
  },

  clearConversationFilters({ commit }) {
    commit(types.CLEAR_CONVERSATION_FILTERS);
  },

  setChatListFilters({ commit }, data) {
    commit(types.SET_CHAT_LIST_FILTERS, data);
  },

  updateChatListFilters({ commit }, data) {
    commit(types.UPDATE_CHAT_LIST_FILTERS, data);
  },

  assignPriority: async ({ dispatch }, { conversationId, priority }) => {
    try {
      await ConversationApi.togglePriority({
        conversationId,
        priority,
      });

      dispatch('setCurrentChatPriority', {
        priority,
        conversationId,
      });
    } catch (error) {
      // Handle error
    }
  },

  setCurrentChatPriority({ commit }, { priority, conversationId }) {
    commit(types.ASSIGN_PRIORITY, { priority, conversationId });
  },

  setContextMenuChatId({ commit }, chatId) {
    commit(types.SET_CONTEXT_MENU_CHAT_ID, chatId);
  },

  getInboxCaptainAssistantById: async ({ commit }, conversationId) => {
    try {
      const response = await ConversationApi.getInboxAssistant(conversationId);
      commit(types.SET_INBOX_CAPTAIN_ASSISTANT, response.data);
    } catch (error) {
      // Handle error
    }
  },

  ...messageReadActions,
  ...messageTranslateActions,
};

export default actions;
