import { CONVERSATION_PRIORITY_ORDER } from 'shared/constants/messages';

export const findPendingMessageIndex = (chat, message) => {
  const { echo_id: tempMessageId } = message;
  return chat.messages.findIndex(
    m => m.id === message.id || m.id === tempMessageId
  );
};

export const filterByStatus = (chatStatus, filterStatus) =>
  filterStatus === 'all' ? true : chatStatus === filterStatus;

export const filterByInbox = (shouldFilter, inboxId, chatInboxId) => {
  const isOnInbox = Number(inboxId) === chatInboxId;
  return inboxId ? isOnInbox && shouldFilter : shouldFilter;
};

export const filterByTeam = (shouldFilter, teamId, chatTeamId) => {
  const isOnTeam = Number(teamId) === chatTeamId;
  return teamId ? isOnTeam && shouldFilter : shouldFilter;
};

export const filterByLabel = (shouldFilter, labels, chatLabels) => {
  const isOnLabel = labels.every(label => chatLabels.includes(label));
  return labels.length ? isOnLabel && shouldFilter : shouldFilter;
};
export const filterByUnattended = (
  shouldFilter,
  conversationType,
  firstReplyOn,
  waitingSince
) => {
  return conversationType === 'unattended'
    ? (!firstReplyOn || !!waitingSince) && shouldFilter
    : shouldFilter;
};

export const applyPageFilters = (conversation, filters) => {
  const { inboxId, status, labels = [], teamId, conversationType } = filters;
  const {
    status: chatStatus,
    inbox_id: chatInboxId,
    labels: chatLabels = [],
    meta = {},
    first_reply_created_at: firstReplyOn,
    waiting_since: waitingSince,
  } = conversation;
  const team = meta.team || {};
  const { id: chatTeamId } = team;

  let shouldFilter = filterByStatus(chatStatus, status);
  shouldFilter = filterByInbox(shouldFilter, inboxId, chatInboxId);
  shouldFilter = filterByTeam(shouldFilter, teamId, chatTeamId);
  shouldFilter = filterByLabel(shouldFilter, labels, chatLabels);
  shouldFilter = filterByUnattended(
    shouldFilter,
    conversationType,
    firstReplyOn,
    waitingSince
  );

  return shouldFilter;
};

/**
 * Filters conversations based on user role and permissions
 *
 * @param {Object} conversation - The conversation object to check permissions for
 * @param {string} role - The user's role (administrator, agent, etc.)
 * @param {Array<string>} permissions - List of permission strings the user has
 * @param {number|string} currentUserId - The ID of the current user
 * @returns {boolean} - Whether the user has permissions to access this conversation
 */
export const applyRoleFilter = (
  conversation,
  role,
  permissions,
  currentUserId
) => {
  // the role === "agent" check is typically not correct on it's own
  // the backend handles this by checking the custom_role_id at the user model
  // here however, the `getUserRole` returns "custom_role" if the id is present,
  // so we can check the role === "agent" directly
  if (['administrator', 'agent'].includes(role)) {
    return true;
  }

  // Check for full conversation management permission
  if (permissions.includes('conversation_manage')) {
    return true;
  }

  const conversationAssignee = conversation.meta.assignee;
  const isUnassigned = !conversationAssignee;
  const isAssignedToUser = conversationAssignee?.id === currentUserId;

  // Check unassigned management permission
  if (permissions.includes('conversation_unassigned_manage')) {
    return isUnassigned || isAssignedToUser;
  }

  // Check participating conversation management permission
  if (permissions.includes('conversation_participating_manage')) {
    return isAssignedToUser;
  }

  return false;
};

const SORT_OPTIONS = {
  last_activity_at_asc: ['sortOnLastActivityAt', 'asc'],
  last_activity_at_desc: ['sortOnLastActivityAt', 'desc'],
  created_at_asc: ['sortOnCreatedAt', 'asc'],
  created_at_desc: ['sortOnCreatedAt', 'desc'],
  priority_asc: ['sortOnPriority', 'asc'],
  priority_desc: ['sortOnPriority', 'desc'],
  waiting_since_asc: ['sortOnWaitingSince', 'asc'],
  waiting_since_desc: ['sortOnWaitingSince', 'desc'],
  priority_desc_created_at_asc: ['sortOnPriorityCreatedAt', 'desc'],
};
const sortAscending = (valueA, valueB) => valueA - valueB;
const sortDescending = (valueA, valueB) => valueB - valueA;

const getSortOrderFunction = sortOrder =>
  sortOrder === 'asc' ? sortAscending : sortDescending;

const sortConfig = {
  sortOnLastActivityAt: (a, b, sortDirection) => {
    const sortFunc = getSortOrderFunction(sortDirection);
    const activityDiff = sortFunc(a.last_activity_at, b.last_activity_at);
    // Whole-second timestamps collide constantly, and a stable sort would then freeze the
    // incumbent on top. Break the tie on id in the same direction the server orders by.
    if (activityDiff !== 0) return activityDiff;
    return sortFunc(a.id, b.id);
  },

  sortOnCreatedAt: (a, b, sortDirection) =>
    getSortOrderFunction(sortDirection)(a.created_at, b.created_at),

  sortOnPriority: (a, b, sortDirection) => {
    const DEFAULT_FOR_NULL = sortDirection === 'asc' ? 5 : 0;

    const p1 = CONVERSATION_PRIORITY_ORDER[a.priority] || DEFAULT_FOR_NULL;
    const p2 = CONVERSATION_PRIORITY_ORDER[b.priority] || DEFAULT_FOR_NULL;

    return getSortOrderFunction(sortDirection)(p1, p2);
  },

  sortOnPriorityCreatedAt: (a, b) => {
    const DEFAULT_FOR_NULL = 0;
    const p1 = CONVERSATION_PRIORITY_ORDER[a.priority] || DEFAULT_FOR_NULL;
    const p2 = CONVERSATION_PRIORITY_ORDER[b.priority] || DEFAULT_FOR_NULL;
    if (p1 !== p2) return p2 - p1;
    return a.created_at - b.created_at;
  },

  sortOnWaitingSince: (a, b, sortDirection) => {
    const sortFunc = getSortOrderFunction(sortDirection);
    if (!a.waiting_since || !b.waiting_since) {
      if (!a.waiting_since && !b.waiting_since) {
        return sortFunc(a.created_at, b.created_at);
      }
      return sortFunc(a.waiting_since ? 0 : 1, b.waiting_since ? 0 : 1);
    }

    return sortFunc(a.waiting_since, b.waiting_since);
  },
};

export const sortComparator = (a, b, sortKey) => {
  const [sortMethod, sortDirection] =
    SORT_OPTIONS[sortKey] || SORT_OPTIONS.last_activity_at_desc;
  return sortConfig[sortMethod](a, b, sortDirection);
};

export const compareByLastActivityDesc = (a, b) =>
  sortComparator(a, b, 'last_activity_at_desc');

// Messages that list rows keep. The list only ever renders the newest non-activity message.
export const LIST_MESSAGE_KEEP_COUNT = 5;

export const isNumericMessageId = id => id !== null && /^\d+$/.test(String(id));

/**
 * Orders message identities. Server ids are numeric and ascend with creation. Optimistic
 * messages carry a uuid until the server echo reconciles them, and must sort after every
 * server message.
 */
export const compareMessageId = (a, b) => {
  const aNumeric = isNumericMessageId(a);
  const bNumeric = isNumericMessageId(b);
  if (aNumeric && bNumeric) return Number(a) - Number(b);
  if (aNumeric) return -1;
  if (bNumeric) return 1;
  return String(a).localeCompare(String(b));
};

export const compareMessages = (a, b) => {
  const createdAtDiff = Number(a.created_at ?? 0) - Number(b.created_at ?? 0);
  // Same-second messages are common, so created_at alone is not an ordering.
  if (createdAtDiff !== 0) return createdAtDiff;
  return compareMessageId(a.id, b.id);
};

export const isNewerMessage = (message, latest) => {
  if (!latest) return true;
  return compareMessages(message, latest) > 0;
};

const isOptimisticMessage = message => !isNumericMessageId(message?.id);

/**
 * Merges incoming messages into an existing array, deduplicated by message identity and
 * ordered deterministically. ActionCable delivers each broadcast as its own job, so arrival
 * order is never creation order.
 *
 * Identity resolution reuses findPendingMessageIndex so the pending-replacement rule cannot
 * drift, and additionally matches an existing pending row by its echo_id. Incoming server
 * data always wins a collision, which drops the stale uuid identity.
 */
/**
 * The single message-identity rule. Built on findPendingMessageIndex so the pending
 * replacement semantics have exactly one definition and cannot drift between the merge and
 * the mutation that decides whether a message is genuinely new.
 */
export const findMessageIndexByIdentity = (messages, message) => {
  const pendingIndex = findPendingMessageIndex({ messages }, message);
  if (pendingIndex !== -1) return pendingIndex;
  return messages.findIndex(
    m =>
      m.echo_id && (m.echo_id === message.id || m.echo_id === message.echo_id)
  );
};

export const mergeMessagesById = (
  existing = [],
  incoming = [],
  { keep } = {}
) => {
  const merged = [...existing];

  incoming.filter(Boolean).forEach(message => {
    const index = findMessageIndexByIdentity(merged, message);
    if (index === -1) {
      merged.push(message);
    } else {
      merged[index] = message;
    }
  });

  // Optimistic rows are ordered by the browser clock, which is not server truth, so they are
  // never sorted - they stay in insertion order after every server message.
  const serverMessages = merged.filter(m => !isOptimisticMessage(m));
  const optimisticMessages = merged.filter(isOptimisticMessage);
  const ordered = [
    ...serverMessages.sort(compareMessages),
    ...optimisticMessages,
  ];

  if (keep && ordered.length > keep) return ordered.slice(-keep);
  return ordered;
};

/**
 * Three-way merge used when a page response meets an entity the realtime pipeline already
 * advanced. Activity never decreases (I1) and the selected chat never loses its loaded
 * history or its completeness flags.
 */
export const mergeConversation = (
  existing,
  incoming,
  { isSelected = false } = {}
) => {
  const keep = isSelected ? undefined : LIST_MESSAGE_KEEP_COUNT;
  const existingActivity = Number(existing.last_activity_at ?? 0);
  const incomingActivity = Number(incoming.last_activity_at ?? 0);

  let base;
  if (incomingActivity < existingActivity) {
    // The local entity is fresher than the snapshot; keep it.
    base = { ...existing };
  } else if (incomingActivity > existingActivity) {
    base = { ...existing, ...incoming };
  } else {
    const existingUpdatedAt = Number(existing.updated_at ?? 0);
    const incomingUpdatedAt = Number(incoming.updated_at ?? 0);
    base =
      incomingUpdatedAt >= existingUpdatedAt
        ? { ...existing, ...incoming }
        : { ...incoming, ...existing };
  }

  const merged = { ...base };

  if (existing.messages || incoming.messages) {
    merged.messages = mergeMessagesById(existing.messages, incoming.messages, {
      keep,
    });
  }

  // History-completeness flags are local state, never carried by a snapshot, and trimming a
  // list row must never imply the thread is fully loaded.
  ['allMessagesLoaded', 'dataFetched'].forEach(flag => {
    if (existing[flag] === undefined) delete merged[flag];
    else merged[flag] = existing[flag];
  });

  const lastActivityAt = Math.max(existingActivity, incomingActivity);
  if (lastActivityAt) {
    merged.last_activity_at = lastActivityAt;
    merged.timestamp = lastActivityAt;
  }
  return merged;
};
