import types from '../../../mutation-types';

export const setPageFilter = ({ dispatch, filter, page, markEndReached }) => {
  dispatch('conversationPage/setCurrentPage', { filter, page }, { root: true });
  if (markEndReached) {
    dispatch('conversationPage/setEndReached', { filter }, { root: true });
  }
};

export const setContacts = (commit, chatList) => {
  commit(
    `contacts/${types.SET_CONTACTS}`,
    chatList.map(chat => chat.meta.sender)
  );
};

export const isOnMentionsView = ({ route: { name: routeName } }) => {
  const MENTION_ROUTES = [
    'conversation_mentions',
    'conversation_through_mentions',
  ];
  return MENTION_ROUTES.includes(routeName);
};

export const isOnUnattendedView = ({ route: { name: routeName } }) => {
  const UNATTENDED_ROUTES = [
    'conversation_unattended',
    'conversation_through_unattended',
  ];
  return UNATTENDED_ROUTES.includes(routeName);
};

export const isOnParticipatingView = ({ route: { name: routeName } }) => {
  const PARTICIPATING_ROUTES = [
    'conversation_participating',
    'conversation_through_participating',
  ];
  return PARTICIPATING_ROUTES.includes(routeName);
};

export const isOnFoldersView = ({ route: { name: routeName } }) => {
  const FOLDER_ROUTES = [
    'folder_conversations',
    'conversations_through_folders',
  ];
  return FOLDER_ROUTES.includes(routeName);
};

export const buildConversationList = (
  context,
  requestPayload,
  responseData,
  filterType
) => {
  const { payload: conversationList, meta: metaData } = responseData;
  context.commit(types.SET_ALL_CONVERSATION, conversationList);
  context.dispatch('conversationStats/set', metaData);
  context.dispatch(
    'conversationLabels/setBulkConversationLabels',
    conversationList
  );
  context.commit(types.CLEAR_LIST_LOADING_STATUS);
  setContacts(context.commit, conversationList);

  // Record which conversations the finder actually returned for the mention / participating
  // views, so those views can filter their rendering without gating realtime insertion.
  const { conversationType } = requestPayload;
  if (conversationType === 'mention' || conversationType === 'participating') {
    context.commit(types.SET_CONVERSATION_VIEW_MEMBERSHIP, {
      view: conversationType,
      ids: conversationList.map(conversation => conversation.id),
    });
  }

  // A reconnect refetch is an unpaginated `updated_within` delta: it carries no page and only
  // the rows that changed since the outage. Letting it through would write `page: null` into
  // the cursor and, on an empty delta, permanently mark the list end-reached - disabling
  // infinite scroll after any websocket blip.
  const isReconnectDelta =
    requestPayload.updatedWithin != null ||
    requestPayload.updated_within != null;
  if (isReconnectDelta) return;

  const { page } = requestPayload;
  setPageFilter({
    dispatch: context.dispatch,
    filter: filterType,
    page,
    // Second belt: never mark end reached without a real page number.
    markEndReached: page != null && !conversationList.length,
  });
};
