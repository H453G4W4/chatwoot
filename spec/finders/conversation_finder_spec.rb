require 'rails_helper'

describe ConversationFinder do
  subject(:conversation_finder) { described_class.new(user_1, params) }

  let!(:account) { create(:account) }
  let!(:user_1) { create(:user, account: account) }
  let!(:user_2) { create(:user, account: account) }
  let!(:admin) { create(:user, account: account, role: :administrator) }
  let!(:inbox) { create(:inbox, account: account, enable_auto_assignment: false) }
  let!(:contact_inbox) { create(:contact_inbox, inbox: inbox, source_id: 'testing_source_id') }
  let!(:restricted_inbox) { create(:inbox, account: account) }

  before do
    create(:inbox_member, user: user_1, inbox: inbox)
    create(:inbox_member, user: user_2, inbox: inbox)
    create(:conversation, account: account, inbox: inbox, assignee: user_1)
    create(:conversation, account: account, inbox: inbox, assignee: user_1)
    create(:conversation, account: account, inbox: inbox, assignee: user_1, status: 'resolved')
    create(:conversation, account: account, inbox: inbox, assignee: user_2, contact_inbox: contact_inbox)
    # unassigned conversation
    create(:conversation, account: account, inbox: inbox)
    Current.account = account
  end

  describe '#perform' do
    context 'with status' do
      let(:params) { { status: 'open', assignee_type: 'me' } }

      it 'filter conversations by status' do
        result = conversation_finder.perform
        expect(result[:conversations].length).to be 2
      end
    end

    context 'with inbox' do
      let!(:restricted_conversation) { create(:conversation, account: account, inbox_id: restricted_inbox.id) }

      it 'returns conversation from any inbox if its admin' do
        params = { inbox_id: restricted_inbox.id }
        result = described_class.new(admin, params).perform

        expect(result[:conversations].map(&:id)).to include(restricted_conversation.id)
      end

      it 'returns conversation from inbox if agent is its member' do
        params = { inbox_id: restricted_inbox.id }
        create(:inbox_member, user: user_1, inbox: restricted_inbox)
        result = described_class.new(user_1, params).perform

        expect(result[:conversations].map(&:id)).to include(restricted_conversation.id)
      end

      it 'does not return conversations from inboxes where agent is not a member' do
        params = { inbox_id: restricted_inbox.id }
        result = described_class.new(user_1, params).perform

        expect(result[:conversations].map(&:id)).not_to include(restricted_conversation.id)
      end

      it 'returns only the conversations from the inbox if inbox_id filter is passed' do
        conversation = create(:conversation, account: account, inbox_id: inbox.id)
        params = { inbox_id: restricted_inbox.id }
        result = described_class.new(admin, params).perform

        conversation_ids = result[:conversations].map(&:id)
        expect(conversation_ids).not_to include(conversation.id)
        expect(conversation_ids).to include(restricted_conversation.id)
      end
    end

    context 'with assignee_type all' do
      let(:params) { { assignee_type: 'all' } }

      it 'filter conversations by assignee type all' do
        result = conversation_finder.perform
        expect(result[:conversations].length).to be 4
      end
    end

    context 'with assignee_type unassigned' do
      let(:params) { { assignee_type: 'unassigned' } }
      let!(:agent_bot_conversation) do
        create(:conversation, account: account, inbox: inbox, assignee_agent_bot: create(:agent_bot, account: account))
      end

      it 'filter conversations by assignee type unassigned' do
        result = conversation_finder.perform
        expect(result[:conversations].length).to be 1
        expect(result[:conversations]).not_to include(agent_bot_conversation)
      end
    end

    context 'with status all' do
      let(:params) { { status: 'all' } }

      it 'returns all conversations' do
        result = conversation_finder.perform
        expect(result[:conversations].length).to be 5
      end
    end

    context 'with unread sort' do
      let(:params) { { status: 'open', sort_by: 'unread' } }

      it 'returns all conversations matching the selected status with the highest unread count first' do
        most_unread_conversation = create(:conversation, account: account, inbox: inbox,
                                                         agent_last_seen_at: 1.hour.ago)
        unread_conversation = create(:conversation, account: account, inbox: inbox,
                                                    agent_last_seen_at: 1.hour.ago)
        read_conversation = create(:conversation, account: account, inbox: inbox,
                                                  agent_last_seen_at: 1.minute.from_now)
        resolved_unread_conversation = create(:conversation, account: account, inbox: inbox, status: 'resolved',
                                                             agent_last_seen_at: 1.hour.ago)

        [most_unread_conversation, unread_conversation, read_conversation, resolved_unread_conversation].each do |conversation|
          create(:message, account: account, inbox: inbox, conversation: conversation,
                           message_type: :incoming, created_at: 5.minutes.ago)
        end
        create(:message, account: account, inbox: inbox, conversation: most_unread_conversation,
                         message_type: :incoming, created_at: 4.minutes.ago)
        resolved_unread_conversation.update!(status: 'resolved')
        read_conversation.update!(last_activity_at: 1.minute.from_now)
        unread_conversation.update!(last_activity_at: 2.minutes.from_now)

        result = conversation_finder.perform
        conversation_ids = result[:conversations].map(&:id)

        expect(conversation_ids).to include(most_unread_conversation.id, unread_conversation.id, read_conversation.id)
        expect(conversation_ids).not_to include(resolved_unread_conversation.id)
        expect(conversation_ids.index(most_unread_conversation.id)).to be < conversation_ids.index(unread_conversation.id)
        expect(conversation_ids.index(unread_conversation.id)).to be < conversation_ids.index(read_conversation.id)
      end

      it 'includes private incoming messages in unread counts used for ordering' do
        private_unread_conversation = create(:conversation, account: account, inbox: inbox,
                                                            agent_last_seen_at: 1.hour.ago)
        unread_conversation = create(:conversation, account: account, inbox: inbox,
                                                    agent_last_seen_at: 1.hour.ago)
        read_conversation = create(:conversation, account: account, inbox: inbox,
                                                  agent_last_seen_at: 1.minute.from_now)

        2.times do
          create(:message, account: account, inbox: inbox, conversation: private_unread_conversation,
                           message_type: :incoming, private: true, created_at: 5.minutes.ago)
        end
        create(:message, account: account, inbox: inbox, conversation: unread_conversation,
                         message_type: :incoming, created_at: 5.minutes.ago)
        create(:message, account: account, inbox: inbox, conversation: read_conversation,
                         message_type: :incoming, created_at: 5.minutes.ago)
        private_unread_conversation.update!(last_activity_at: 10.minutes.ago)
        unread_conversation.update!(last_activity_at: 2.minutes.from_now)
        read_conversation.update!(last_activity_at: 1.minute.from_now)

        result = conversation_finder.perform
        conversation_ids = result[:conversations].map(&:id)

        expect(private_unread_conversation.unread_incoming_messages.count).to eq 2
        expect(conversation_ids.index(private_unread_conversation.id)).to be < conversation_ids.index(unread_conversation.id)
        expect(conversation_ids.index(unread_conversation.id)).to be < conversation_ids.index(read_conversation.id)
      end
    end

    context 'with assignee_type assigned' do
      let(:params) { { assignee_type: 'assigned' } }
      let!(:agent_bot_conversation) do
        create(:conversation, account: account, inbox: inbox, assignee_agent_bot: create(:agent_bot, account: account))
      end

      it 'filter conversations by assignee type assigned' do
        result = conversation_finder.perform
        expect(result[:conversations].length).to be 4
        expect(result[:conversations]).to include(agent_bot_conversation)
      end

      it 'returns the correct meta' do
        result = conversation_finder.perform
        expect(result[:count]).to eq({
                                       mine_count: 2,
                                       assigned_count: 4,
                                       unassigned_count: 1,
                                       all_count: 5,
                                       needs_reply_count: 5
                                     })
      end
    end

    context 'with team' do
      let(:team) { create(:team, account: account) }
      let(:params) { { team_id: team.id } }

      it 'filter conversations by team' do
        create(:conversation, account: account, inbox: inbox, team: team)
        result = conversation_finder.perform
        expect(result[:conversations].length).to be 1
      end
    end

    context 'with labels' do
      let(:params) { { labels: ['resolved'] } }

      it 'filter conversations by labels' do
        conversation = inbox.conversations.first
        conversation.update_labels('resolved')

        result = conversation_finder.perform
        expect(result[:conversations].length).to be 1
      end
    end

    context 'with source_id' do
      let(:params) { { source_id: 'testing_source_id' } }

      it 'filter conversations by source id' do
        result = conversation_finder.perform
        expect(result[:conversations].length).to be 1
      end
    end

    context 'without source' do
      let(:params) { {} }

      it 'returns conversations with any source' do
        result = conversation_finder.perform
        expect(result[:conversations].length).to be 4
      end
    end

    context 'with updated_within' do
      let(:params) { { updated_within: 20, assignee_type: 'unassigned', sort_by: 'created_at_asc' } }

      it 'filters based on params, sort order but returns all conversations without pagination with in time range' do
        # value of updated_within is in seconds
        # write spec based on that
        conversations = create_list(:conversation, 50, account: account,
                                                       inbox: inbox, assignee: nil,
                                                       updated_at: Time.now.utc - 30.seconds,
                                                       created_at: Time.now.utc - 30.seconds)
        # update updated_at of 27 conversations to be with in 20 seconds
        conversations[0..27].each do |conversation|
          conversation.update(updated_at: Time.now.utc - 10.seconds)
        end
        result = conversation_finder.perform
        # pagination is not applied
        # filters are applied
        # modified conversations + 1 conversation created during set up
        expect(result[:conversations].length).to be 29
        # ensure that the conversations are sorted by created_at
        expect(result[:conversations].first.created_at).to be < result[:conversations].last.created_at
      end
    end

    context 'with pagination' do
      let(:params) { { status: 'open', assignee_type: 'me', page: 1 } }

      it 'returns paginated conversations' do
        create_list(:conversation, 50, account: account, inbox: inbox, assignee: user_1)
        result = conversation_finder.perform
        expect(result[:conversations].length).to be 25
      end
    end

    context 'with perform_meta_only' do
      let(:params) { { assignee_type: 'assigned' } }

      it 'returns only count without conversations' do
        result = conversation_finder.perform_meta_only
        expect(result).to have_key(:count)
        expect(result).not_to have_key(:conversations)
      end

      it 'returns the correct counts' do
        result = conversation_finder.perform_meta_only
        expect(result[:count]).to eq({
                                       mine_count: 2,
                                       assigned_count: 3,
                                       unassigned_count: 1,
                                       all_count: 4,
                                       needs_reply_count: 4
                                     })
      end

      it 'returns same counts as perform' do
        meta_result = conversation_finder.perform_meta_only
        full_result = conversation_finder.perform
        expect(meta_result[:count]).to eq(full_result[:count])
      end
    end

    context 'with unattended' do
      let(:params) { { status: 'open', assignee_type: 'me', conversation_type: 'unattended' } }

      it 'returns unattended conversations' do
        create(:conversation, account: account, first_reply_created_at: Time.now.utc, assignee: user_1) # attended_conversation
        create(:conversation, account: account, first_reply_created_at: nil, assignee: user_1) # unattended_conversation_no_first_reply
        create(:conversation, account: account, first_reply_created_at: Time.now.utc,
                              assignee: user_1, waiting_since: Time.now.utc) # unattended_conversation_waiting_since

        result = conversation_finder.perform
        expect(result[:conversations].length).to be 2
      end
    end

    context 'with participating' do
      let(:params) { { status: 'open', assignee_type: 'all', conversation_type: 'participating' } }

      it 'excludes participating conversations from inboxes the user no longer has access to' do
        accessible_conversation = create(:conversation, account: account, inbox: inbox)
        revoked_conversation = create(:conversation, account: account, inbox: restricted_inbox)
        revoked_membership = create(:inbox_member, user: user_1, inbox: restricted_inbox)
        create(:conversation_participant, user: user_1, conversation: accessible_conversation, account: account)
        create(:conversation_participant, user: user_1, conversation: revoked_conversation, account: account)
        revoked_membership.destroy!

        result = conversation_finder.perform

        expect(result[:conversations].map(&:id)).to contain_exactly(accessible_conversation.id)
      end

      it 'excludes the inaccessible conversation from the meta counts too' do
        accessible_conversation = create(:conversation, account: account, inbox: inbox)
        revoked_conversation = create(:conversation, account: account, inbox: restricted_inbox)
        revoked_membership = create(:inbox_member, user: user_1, inbox: restricted_inbox)
        create(:conversation_participant, user: user_1, conversation: accessible_conversation, account: account)
        create(:conversation_participant, user: user_1, conversation: revoked_conversation, account: account)
        revoked_membership.destroy!

        result = conversation_finder.perform_meta_only

        expect(result[:count][:all_count]).to eq 1
      end
    end
  end

  describe '#perform with needs_reply' do
    let(:params) { { status: 'open', assignee_type: 'all' } }
    let!(:answered_conversation) { create(:conversation, account: account, inbox: inbox) }

    # waiting_since is stamped unconditionally by Conversation#ensure_waiting_since on create,
    # so an "answered" row has to have it cleared afterwards.
    before { answered_conversation.update!(waiting_since: nil) }

    it 'returns only conversations that are waiting for a reply' do
      result = described_class.new(user_1, params.merge(needs_reply: 'true')).perform

      expect(result[:conversations]).to be_present
      expect(result[:conversations].map(&:waiting_since)).to all(be_present)
      expect(result[:conversations].map(&:id)).not_to include(answered_conversation.id)
    end

    it 'returns conversations regardless of waiting_since when needs_reply is absent' do
      result = described_class.new(user_1, params).perform

      expect(result[:conversations].map(&:id)).to include(answered_conversation.id)
    end

    it 'does not filter when needs_reply casts to false' do
      result = described_class.new(user_1, params.merge(needs_reply: 'false')).perform

      expect(result[:conversations].map(&:id)).to include(answered_conversation.id)
    end

    it 'reports needs_reply_count over the same base scope as all_count' do
      result = described_class.new(user_1, params).perform

      expect(result[:count][:all_count]).to eq 5
      expect(result[:count][:needs_reply_count]).to eq 4
    end

    it 'returns identical counts with and without the needs_reply param' do
      filtered = described_class.new(user_1, params.merge(needs_reply: 'true')).perform[:count]
      unfiltered = described_class.new(user_1, params).perform[:count]

      expect(filtered).to eq(unfiltered)
      expect(filtered[:needs_reply_count]).to eq 4
    end

    it 'returns identical meta-only counts with and without the needs_reply param' do
      filtered = described_class.new(user_1, params.merge(needs_reply: 'true')).perform_meta_only[:count]
      unfiltered = described_class.new(user_1, params).perform_meta_only[:count]

      expect(filtered).to eq(unfiltered)
    end

    it 'composes with a selected inbox' do
      other_inbox = create(:inbox, account: account)
      create(:inbox_member, user: user_1, inbox: other_inbox)
      other_waiting = create(:conversation, account: account, inbox: other_inbox)

      result = described_class.new(user_1, params.merge(needs_reply: 'true', inbox_id: other_inbox.id)).perform

      expect(result[:conversations].map(&:id)).to contain_exactly(other_waiting.id)
    end

    it 'composes with status' do
      # Resolving is an update, so Conversation#handle_resolved_status_change clears waiting_since.
      resolved_and_answered = create(:conversation, account: account, inbox: inbox)
      resolved_and_answered.resolved!
      still_waiting = create(:conversation, account: account, inbox: inbox, status: 'resolved')

      result = described_class.new(user_1, params.merge(needs_reply: 'true', status: 'resolved')).perform

      expect(result[:conversations].map(&:id)).to include(still_waiting.id)
      expect(result[:conversations].map(&:id)).not_to include(resolved_and_answered.id)
    end

    it 'composes with team' do
      team = create(:team, account: account)
      team_conversation = create(:conversation, account: account, inbox: inbox, team: team)

      result = described_class.new(user_1, params.merge(needs_reply: 'true', team_id: team.id)).perform

      expect(result[:conversations].map(&:id)).to contain_exactly(team_conversation.id)
    end

    it 'composes with labels' do
      labelled = create(:conversation, account: account, inbox: inbox)
      labelled.update!(label_list: ['billing'])

      result = described_class.new(user_1, params.merge(needs_reply: 'true', labels: ['billing'])).perform

      expect(result[:conversations].map(&:id)).to contain_exactly(labelled.id)
    end

    it 'composes with conversation_type unattended' do
      result = described_class.new(user_1, params.merge(needs_reply: 'true', conversation_type: 'unattended')).perform

      expect(result[:conversations].map(&:id)).not_to include(answered_conversation.id)
      expect(result[:conversations].map(&:waiting_since)).to all(be_present)
    end

    it 'never widens the permission scope' do
      restricted_conversation = create(:conversation, account: account, inbox: restricted_inbox)

      result = described_class.new(user_1, params.merge(needs_reply: 'true')).perform

      expect(result[:conversations].map(&:id)).not_to include(restricted_conversation.id)
      expect(result[:count][:needs_reply_count]).to eq 4
    end

    it 'paginates the filtered result set' do
      create_list(:conversation, 30, account: account, inbox: inbox)

      page_1 = described_class.new(user_1, params.merge(needs_reply: 'true', page: 1)).perform
      page_2 = described_class.new(user_1, params.merge(needs_reply: 'true', page: 2)).perform

      expect(page_1[:conversations].length).to eq 25
      expect(page_2[:conversations].length).to eq 9
      expect(page_1[:conversations].map(&:id) & page_2[:conversations].map(&:id)).to be_empty
    end
  end

  describe '#perform ordering determinism' do
    let(:params) { { status: 'open', assignee_type: 'all', sort_by: 'last_activity_at_desc' } }

    it 'breaks last_activity_at ties by id descending' do
      tied_at = 1.hour.ago.change(usec: 0)
      tied = create_list(:conversation, 5, account: account, inbox: inbox)
      # rubocop:disable Rails/SkipsModelValidations
      Conversation.where(id: tied.map(&:id)).update_all(last_activity_at: tied_at)
      # rubocop:enable Rails/SkipsModelValidations

      result = described_class.new(user_1, params).perform
      tied_ids_in_order = result[:conversations].map(&:id) & tied.map(&:id)

      expect(tied_ids_in_order).to eq(tied.map(&:id).sort.reverse)
    end

    it 'keeps pages disjoint when every row shares the same last_activity_at' do
      tied_at = 2.hours.ago.change(usec: 0)
      created = create_list(:conversation, 30, account: account, inbox: inbox)
      # rubocop:disable Rails/SkipsModelValidations
      Conversation.where(account_id: account.id).update_all(last_activity_at: tied_at)
      # rubocop:enable Rails/SkipsModelValidations

      page_1 = described_class.new(user_1, params.merge(page: 1)).perform[:conversations].map(&:id)
      page_2 = described_class.new(user_1, params.merge(page: 2)).perform[:conversations].map(&:id)

      expect(page_1.length).to eq 25
      expect(page_1 & page_2).to be_empty
      expect(page_1 + page_2).to eq((page_1 + page_2).sort.reverse)
      expect(created.map(&:id) - (page_1 + page_2)).to be_empty
    end
  end
end
