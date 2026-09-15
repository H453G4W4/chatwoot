import types from '../../../mutation-types';
import { mutations } from '../../conversationStats';

describe('#mutations', () => {
  describe('#SET_CONV_TAB_META', () => {
    it('set conversation stats correctly', () => {
      const state = {};
      mutations[types.SET_CONV_TAB_META](state, {
        mine_count: 1,
        unassigned_count: 1,
        all_count: 2,
      });
      expect(state).toEqual({
        mineCount: 1,
        unAssignedCount: 1,
        allCount: 2,
        // the folder/advanced-filter endpoint omits this count, so it must default
        needsReplyCount: 0,
        updatedOn: expect.any(Date),
      });
    });

    it('reads needs_reply_count from the server meta', () => {
      const state = {};
      mutations[types.SET_CONV_TAB_META](state, {
        mine_count: 1,
        unassigned_count: 1,
        all_count: 5,
        needs_reply_count: 3,
      });
      expect(state.needsReplyCount).toBe(3);
    });

    it('defaults every count to 0 when the payload is empty', () => {
      const state = {};
      mutations[types.SET_CONV_TAB_META](state);
      expect(state).toEqual({
        mineCount: 0,
        unAssignedCount: 0,
        allCount: 0,
        needsReplyCount: 0,
        updatedOn: expect.any(Date),
      });
    });
  });
});
