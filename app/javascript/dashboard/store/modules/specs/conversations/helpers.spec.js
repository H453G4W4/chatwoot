import {
  findPendingMessageIndex,
  applyPageFilters,
  filterByInbox,
  filterByTeam,
  filterByLabel,
  filterByUnattended,
  compareByLastActivityDesc,
  compareMessageId,
  compareMessages,
  isNewerMessage,
  mergeMessagesById,
  mergeConversation,
  isWaitingForReply,
  filterByNeedsReply,
  filterByViewMembership,
} from '../../conversations/helpers';

const conversationList = [
  {
    id: 1,
    inbox_id: 2,
    status: 'open',
    meta: {},
    labels: ['sales', 'dev'],
  },
  {
    id: 2,
    inbox_id: 2,
    status: 'open',
    meta: {},
    labels: ['dev'],
  },
  {
    id: 11,
    inbox_id: 3,
    status: 'resolved',
    meta: { team: { id: 5 } },
    labels: [],
  },
  {
    id: 22,
    inbox_id: 4,
    status: 'pending',
    meta: { team: { id: 5 } },
    labels: ['sales'],
  },
];

describe('#findPendingMessageIndex', () => {
  it('returns the correct index of pending message with id', () => {
    const chat = {
      messages: [{ id: 1, status: 'progress' }],
    };
    const message = { echo_id: 1 };
    expect(findPendingMessageIndex(chat, message)).toEqual(0);
  });

  it('returns -1 if pending message with id is not present', () => {
    const chat = {
      messages: [{ id: 1, status: 'progress' }],
    };
    const message = { echo_id: 2 };
    expect(findPendingMessageIndex(chat, message)).toEqual(-1);
  });
});

describe('#applyPageFilters', () => {
  describe('#filter-team', () => {
    it('returns true if conversation has team and team filter is active', () => {
      const filters = {
        status: 'resolved',
        teamId: 5,
      };
      expect(applyPageFilters(conversationList[2], filters)).toEqual(true);
    });
    it('returns true if conversation has no team and team filter is active', () => {
      const filters = {
        status: 'open',
        teamId: 5,
      };
      expect(applyPageFilters(conversationList[0], filters)).toEqual(false);
    });
  });

  describe('#filter-inbox', () => {
    it('returns true if conversation has inbox and inbox filter is active', () => {
      const filters = {
        status: 'pending',
        inboxId: 4,
      };
      expect(applyPageFilters(conversationList[3], filters)).toEqual(true);
    });
    it('returns true if conversation has no inbox and inbox filter is active', () => {
      const filters = {
        status: 'open',
        inboxId: 5,
      };
      expect(applyPageFilters(conversationList[0], filters)).toEqual(false);
    });
  });

  describe('#filter-labels', () => {
    it('returns true if conversation has labels and labels filter is active', () => {
      const filters = {
        status: 'open',
        labels: ['dev'],
      };
      expect(applyPageFilters(conversationList[0], filters)).toEqual(true);
    });
    it('returns true if conversation has no inbox and inbox filter is active', () => {
      const filters = {
        status: 'open',
        labels: ['dev'],
      };
      expect(applyPageFilters(conversationList[2], filters)).toEqual(false);
    });
  });

  describe('#filter-status', () => {
    it('returns true if conversation has status and status filter is active', () => {
      const filters = {
        status: 'open',
      };
      expect(applyPageFilters(conversationList[1], filters)).toEqual(true);
    });
    it('returns true if conversation has status and status filter is all', () => {
      const filters = {
        status: 'all',
      };
      expect(applyPageFilters(conversationList[1], filters)).toEqual(true);
    });
  });
});

describe('#filterByInbox', () => {
  it('returns true if conversation has inbox filter active', () => {
    const inboxId = '1';
    const chatInboxId = 1;
    expect(filterByInbox(true, inboxId, chatInboxId)).toEqual(true);
  });
  it('returns false if inbox filter is not active', () => {
    const inboxId = '1';
    const chatInboxId = 13;
    expect(filterByInbox(true, inboxId, chatInboxId)).toEqual(false);
  });
});

describe('#filterByTeam', () => {
  it('returns true if conversation has team and team filter is active', () => {
    const [teamId, chatTeamId] = ['1', 1];
    expect(filterByTeam(true, teamId, chatTeamId)).toEqual(true);
  });
  it('returns false if team filter is not active', () => {
    const [teamId, chatTeamId] = ['1', 12];
    expect(filterByTeam(true, teamId, chatTeamId)).toEqual(false);
  });
});

describe('#filterByLabel', () => {
  it('returns true if conversation has labels and labels filter is active', () => {
    const labels = ['dev', 'cs'];
    const chatLabels = ['dev', 'cs', 'sales'];
    expect(filterByLabel(true, labels, chatLabels)).toEqual(true);
  });
  it('returns false if conversation has not all labels', () => {
    const labels = ['dev', 'cs', 'sales'];
    const chatLabels = ['cs', 'sales'];
    expect(filterByLabel(true, labels, chatLabels)).toEqual(false);
  });
});

describe('#filterByUnattended', () => {
  it('returns true if conversation type is unattended and has no first reply', () => {
    expect(filterByUnattended(true, 'unattended', undefined)).toEqual(true);
  });
  it('returns false if conversation type is not unattended and has no first reply', () => {
    expect(filterByUnattended(false, 'mentions', undefined)).toEqual(false);
  });
  it('returns true if conversation type is unattended and has first reply', () => {
    expect(filterByUnattended(true, 'mentions', 123)).toEqual(true);
  });
});

describe('#compareByLastActivityDesc', () => {
  it('orders by last_activity_at descending', () => {
    const list = [
      { id: 1, last_activity_at: 100 },
      { id: 2, last_activity_at: 300 },
      { id: 3, last_activity_at: 200 },
    ];
    expect([...list].sort(compareByLastActivityDesc).map(c => c.id)).toEqual([
      2, 3, 1,
    ]);
  });

  it('breaks a last_activity_at tie on id descending', () => {
    const list = [
      { id: 7, last_activity_at: 100 },
      { id: 9, last_activity_at: 100 },
      { id: 8, last_activity_at: 100 },
    ];
    expect([...list].sort(compareByLastActivityDesc).map(c => c.id)).toEqual([
      9, 8, 7,
    ]);
  });

  it('does not mutate the source array', () => {
    const list = Object.freeze([
      { id: 1, last_activity_at: 100 },
      { id: 2, last_activity_at: 300 },
    ]);
    expect(() => [...list].sort(compareByLastActivityDesc)).not.toThrow();
    expect(list.map(c => c.id)).toEqual([1, 2]);
  });

  it('never lets priority influence the order', () => {
    const list = [
      { id: 1, last_activity_at: 300, priority: 'low' },
      { id: 2, last_activity_at: 100, priority: 'urgent' },
    ];
    expect([...list].sort(compareByLastActivityDesc).map(c => c.id)).toEqual([
      1, 2,
    ]);
  });
});

describe('#compareMessageId', () => {
  it('orders numeric ids ascending', () => {
    expect(compareMessageId(101, 102)).toBeLessThan(0);
  });

  it('places numeric ids before optimistic uuids', () => {
    expect(compareMessageId(101, 'uuid-a')).toBeLessThan(0);
    expect(compareMessageId('uuid-a', 101)).toBeGreaterThan(0);
  });
});

describe('#compareMessages / #isNewerMessage', () => {
  it('breaks a same-second tie on message id', () => {
    const a = { id: 101, created_at: 1000 };
    const b = { id: 102, created_at: 1000 };
    expect(compareMessages(a, b)).toBeLessThan(0);
    expect(isNewerMessage(b, a)).toBe(true);
    expect(isNewerMessage(a, b)).toBe(false);
  });

  it('treats any message as newer than nothing', () => {
    expect(isNewerMessage({ id: 1, created_at: 1 }, undefined)).toBe(true);
  });
});

describe('#mergeMessagesById', () => {
  it('orders out-of-order arrivals chronologically', () => {
    const merged = mergeMessagesById(
      [],
      [
        { id: 102, created_at: 1200 },
        { id: 101, created_at: 1100 },
      ]
    );
    expect(merged.map(m => m.id)).toEqual([101, 102]);
  });

  it('does not duplicate a repeated cable event', () => {
    const merged = mergeMessagesById(
      [{ id: 101, created_at: 1100, content: 'a' }],
      [{ id: 101, created_at: 1100, content: 'a' }]
    );
    expect(merged).toHaveLength(1);
  });

  it('replaces a pending uuid with its server message and drops the stale identity', () => {
    const pending = { id: 'uuid-1', echo_id: 'uuid-1', created_at: 1200 };
    const server = { id: 500, echo_id: 'uuid-1', created_at: 1200 };
    const merged = mergeMessagesById([pending], [server]);
    expect(merged).toHaveLength(1);
    expect(merged[0].id).toBe(500);
    expect(merged.some(m => m.id === 'uuid-1')).toBe(false);
  });

  it('matches an existing pending row by its echo_id', () => {
    const pending = { id: 'uuid-9', echo_id: 'uuid-9', created_at: 10 };
    const server = { id: 900, echo_id: 'uuid-9', created_at: 10 };
    expect(mergeMessagesById([pending], [server])).toHaveLength(1);
  });

  it('keeps optimistic messages after server messages in insertion order', () => {
    const merged = mergeMessagesById(
      [],
      [
        { id: 'uuid-a', echo_id: 'uuid-a', created_at: 5 },
        { id: 'uuid-b', echo_id: 'uuid-b', created_at: 1 },
        { id: 300, created_at: 9999 },
      ]
    );
    // the browser clock on the optimistic rows is not server truth, so they are not sorted
    expect(merged.map(m => m.id)).toEqual([300, 'uuid-a', 'uuid-b']);
  });

  it('keeps only the newest `keep` messages when asked', () => {
    const existing = [1, 2, 3, 4, 5, 6, 7].map(id => ({
      id,
      created_at: id,
    }));
    const merged = mergeMessagesById(existing, [], { keep: 5 });
    expect(merged.map(m => m.id)).toEqual([3, 4, 5, 6, 7]);
  });
});

describe('#mergeConversation', () => {
  const existing = {
    id: 1,
    last_activity_at: 200,
    updated_at: 200,
    unread_count: 3,
    messages: [{ id: 10, created_at: 100 }],
  };

  it('keeps the fresher local entity when the snapshot is older', () => {
    const merged = mergeConversation(
      existing,
      { id: 1, last_activity_at: 100, updated_at: 100, unread_count: 0 },
      { isSelected: false }
    );
    expect(merged.last_activity_at).toBe(200);
    expect(merged.unread_count).toBe(3);
  });

  it('accepts a newer snapshot', () => {
    const merged = mergeConversation(
      existing,
      { id: 1, last_activity_at: 300, updated_at: 300, unread_count: 9 },
      { isSelected: false }
    );
    expect(merged.last_activity_at).toBe(300);
    expect(merged.timestamp).toBe(300);
    expect(merged.unread_count).toBe(9);
  });

  it('lets the newer updated_at win when activity is equal', () => {
    const merged = mergeConversation(
      existing,
      { id: 1, last_activity_at: 200, updated_at: 500, status: 'resolved' },
      { isSelected: false }
    );
    expect(merged.status).toBe('resolved');
    expect(merged.last_activity_at).toBe(200);
  });

  it('never lets activity regress', () => {
    const merged = mergeConversation(
      existing,
      { id: 1, last_activity_at: 1, updated_at: 900 },
      { isSelected: false }
    );
    expect(merged.last_activity_at).toBe(200);
  });

  it('trims a non-selected row to five messages without implying completeness', () => {
    const many = {
      ...existing,
      messages: [1, 2, 3, 4, 5, 6, 7].map(id => ({ id, created_at: id })),
    };
    const merged = mergeConversation(many, { id: 1 }, { isSelected: false });
    expect(merged.messages).toHaveLength(5);
    expect(merged.allMessagesLoaded).toBeUndefined();
    expect(merged.dataFetched).toBeUndefined();
  });

  it('never trims the selected conversation', () => {
    const many = {
      ...existing,
      allMessagesLoaded: true,
      dataFetched: true,
      messages: [1, 2, 3, 4, 5, 6, 7].map(id => ({ id, created_at: id })),
    };
    const merged = mergeConversation(many, { id: 1 }, { isSelected: true });
    expect(merged.messages).toHaveLength(7);
    expect(merged.allMessagesLoaded).toBe(true);
    expect(merged.dataFetched).toBe(true);
  });
});

describe('#isWaitingForReply / #filterByNeedsReply', () => {
  it('treats waiting_since 0 as nil, never a null check', () => {
    expect(isWaitingForReply({ waiting_since: 0 })).toBe(false);
    expect(isWaitingForReply({ waiting_since: 1712345678 })).toBe(true);
    expect(isWaitingForReply({})).toBe(false);
  });

  it('keeps every conversation when Needs Reply is inactive', () => {
    expect(filterByNeedsReply(true, false, { waiting_since: 0 })).toBe(true);
  });

  it('keeps only waiting conversations when active', () => {
    expect(filterByNeedsReply(true, true, { waiting_since: 99 })).toBe(true);
    expect(filterByNeedsReply(true, true, { waiting_since: 0 })).toBe(false);
  });
});

describe('#applyPageFilters with needsReply', () => {
  const conversation = (waitingSince, extra = {}) => ({
    id: 1,
    status: 'open',
    inbox_id: 1,
    labels: [],
    meta: {},
    waiting_since: waitingSince,
    ...extra,
  });

  it('shows a waiting conversation and hides an answered one', () => {
    const filters = { status: 'open', needsReply: true };
    expect(applyPageFilters(conversation(99), filters)).toBe(true);
    expect(applyPageFilters(conversation(0), filters)).toBe(false);
  });

  it('does not filter when the queue is All', () => {
    const filters = { status: 'open', needsReply: false };
    expect(applyPageFilters(conversation(0), filters)).toBe(true);
  });
});

describe('#filterByViewMembership', () => {
  const membership = {
    mention: new Set([1]),
    participating: new Set([2]),
  };

  it('is inert on the global queue', () => {
    expect(filterByViewMembership(true, undefined, 99, membership)).toBe(true);
  });

  it('renders only conversations the finder returned for Mentions', () => {
    expect(filterByViewMembership(true, 'mention', 1, membership)).toBe(true);
    expect(filterByViewMembership(true, 'mention', 99, membership)).toBe(false);
  });

  it('renders only conversations the finder returned for Participating', () => {
    expect(filterByViewMembership(true, 'participating', 2, membership)).toBe(
      true
    );
    expect(filterByViewMembership(true, 'participating', 99, membership)).toBe(
      false
    );
  });

  it('does not filter before the view list response has landed', () => {
    expect(filterByViewMembership(true, 'mention', 99, undefined)).toBe(true);
    expect(filterByViewMembership(true, 'mention', 99, {})).toBe(true);
  });
});
