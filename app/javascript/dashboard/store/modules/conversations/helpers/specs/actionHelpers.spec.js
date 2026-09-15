import {
  isOnMentionsView,
  isOnFoldersView,
  isOnParticipatingView,
  buildConversationList,
} from '../actionHelpers';

describe('#isOnMentionsView', () => {
  it('return valid responses when passing the state', () => {
    expect(isOnMentionsView({ route: { name: 'conversation_mentions' } })).toBe(
      true
    );
    expect(isOnMentionsView({ route: { name: 'conversation_messages' } })).toBe(
      false
    );
  });
});

describe('#isOnFoldersView', () => {
  it('return valid responses when passing the state', () => {
    expect(isOnFoldersView({ route: { name: 'folder_conversations' } })).toBe(
      true
    );
    expect(
      isOnFoldersView({ route: { name: 'conversations_through_folders' } })
    ).toBe(true);
    expect(isOnFoldersView({ route: { name: 'conversation_messages' } })).toBe(
      false
    );
  });
});

describe('#isOnParticipatingView', () => {
  it('return valid responses when passing the state', () => {
    expect(
      isOnParticipatingView({ route: { name: 'conversation_participating' } })
    ).toBe(true);
    expect(
      isOnParticipatingView({
        route: { name: 'conversation_through_participating' },
      })
    ).toBe(true);
    expect(
      isOnParticipatingView({ route: { name: 'conversation_messages' } })
    ).toBe(false);
  });
});

describe('#buildConversationList', () => {
  const buildContext = () => ({ commit: vi.fn(), dispatch: vi.fn() });
  const responseWith = payload => ({
    payload,
    meta: { all_count: payload.length },
  });
  const pageCalls = ctx =>
    ctx.dispatch.mock.calls.filter(c =>
      String(c[0]).startsWith('conversationPage/')
    );

  it('writes the page cursor for an ordinary paginated response', () => {
    const ctx = buildContext();
    buildConversationList(
      ctx,
      { page: 2 },
      responseWith([{ id: 1, meta: { sender: { id: 9 } } }]),
      'all'
    );
    expect(pageCalls(ctx)).toEqual([
      [
        'conversationPage/setCurrentPage',
        { filter: 'all', page: 2 },
        { root: true },
      ],
    ]);
  });

  it('marks end reached only when a real page returned nothing', () => {
    const ctx = buildContext();
    buildConversationList(ctx, { page: 3 }, responseWith([]), 'all');
    expect(pageCalls(ctx)).toEqual([
      [
        'conversationPage/setCurrentPage',
        { filter: 'all', page: 3 },
        { root: true },
      ],
      ['conversationPage/setEndReached', { filter: 'all' }, { root: true }],
    ]);
  });

  it('never marks end reached when the page is null', () => {
    const ctx = buildContext();
    buildConversationList(ctx, { page: null }, responseWith([]), 'all');
    expect(
      pageCalls(ctx).some(c => c[0] === 'conversationPage/setEndReached')
    ).toBe(false);
  });

  it('leaves pagination untouched for an EMPTY reconnect delta', () => {
    const ctx = buildContext();
    // ReconnectService refetches with page: null + updatedWithin
    buildConversationList(
      ctx,
      { page: null, updatedWithin: 120 },
      responseWith([]),
      'all'
    );
    // no cursor write, no end-reached: one websocket blip must not disable infinite scroll
    expect(pageCalls(ctx)).toEqual([]);
  });

  it('merges a NON-EMPTY reconnect delta without altering pagination', () => {
    const ctx = buildContext();
    const payload = [{ id: 7, meta: { sender: { id: 9 } } }];
    buildConversationList(
      ctx,
      { page: null, updatedWithin: 120 },
      responseWith(payload),
      'all'
    );
    expect(ctx.commit).toHaveBeenCalledWith('SET_ALL_CONVERSATION', payload);
    expect(ctx.commit).toHaveBeenCalledWith('CLEAR_LIST_LOADING_STATUS');
    expect(pageCalls(ctx)).toEqual([]);
  });

  it('records view membership from a Mentions list response', () => {
    const ctx = buildContext();
    buildConversationList(
      ctx,
      { page: 1, conversationType: 'mention' },
      responseWith([
        { id: 11, meta: { sender: { id: 1 } } },
        { id: 12, meta: { sender: { id: 2 } } },
      ]),
      'all'
    );
    expect(ctx.commit).toHaveBeenCalledWith(
      'SET_CONVERSATION_VIEW_MEMBERSHIP',
      { view: 'mention', ids: [11, 12] }
    );
  });

  it('records view membership from a Participating list response', () => {
    const ctx = buildContext();
    buildConversationList(
      ctx,
      { page: 1, conversationType: 'participating' },
      responseWith([{ id: 21, meta: { sender: { id: 1 } } }]),
      'all'
    );
    expect(ctx.commit).toHaveBeenCalledWith(
      'SET_CONVERSATION_VIEW_MEMBERSHIP',
      { view: 'participating', ids: [21] }
    );
  });

  it('records no membership for the global queue', () => {
    const ctx = buildContext();
    buildConversationList(
      ctx,
      { page: 1 },
      responseWith([{ id: 31, meta: { sender: { id: 1 } } }]),
      'all'
    );
    expect(ctx.commit).not.toHaveBeenCalledWith(
      'SET_CONVERSATION_VIEW_MEMBERSHIP',
      expect.anything()
    );
  });

  it('also recognises the snake_case updated_within key', () => {
    const ctx = buildContext();
    buildConversationList(
      ctx,
      { page: null, updated_within: 120 },
      responseWith([]),
      'all'
    );
    expect(pageCalls(ctx)).toEqual([]);
  });
});
