require 'rails_helper'

RSpec.describe ConversationFinder do
  describe '#perform_meta_only' do
    let(:account) { create(:account) }
    let(:agent) { create(:user, account: account, role: :agent) }
    let(:other_agent) { create(:user, account: account, role: :agent) }
    let(:inbox) { create(:inbox, account: account) }

    before do
      Current.account = account
      create(:inbox_member, user: agent, inbox: inbox)
      account.account_users.find_by(user: agent).update!(
        role: :agent,
        custom_role: create(:custom_role, account: account, permissions: %w[conversation_participating_manage])
      )
    end

    it 'counts participant-filtered conversations once when assigned conversations have multiple participants' do
      assigned_conversation = create(:conversation, account: account, inbox: inbox, assignee: agent)
      participating_conversation = create(:conversation, account: account, inbox: inbox, assignee: other_agent)
      create(:conversation, account: account, inbox: inbox, assignee: other_agent)

      2.times do
        participant = create(:user, account: account, role: :agent)
        create(:inbox_member, user: participant, inbox: inbox)
        create(:conversation_participant, account: account, conversation: assigned_conversation, user: participant)
      end
      create(:conversation_participant, account: account, conversation: participating_conversation, user: agent)

      result = described_class.new(agent, { status: 'open' }).perform_meta_only

      expect(result[:count]).to eq({
                                     mine_count: 1,
                                     assigned_count: 2,
                                     unassigned_count: 0,
                                     all_count: 2,
                                     needs_reply_count: 2
                                   })
    end
  end

  describe '#perform with needs_reply under a custom role' do
    let(:account) { create(:account) }
    let(:agent) { create(:user, account: account, role: :agent) }
    let(:other_agent) { create(:user, account: account, role: :agent) }
    let(:inbox) { create(:inbox, account: account) }

    before do
      Current.account = account
      create(:inbox_member, user: agent, inbox: inbox)
      account.account_users.find_by(user: agent).update!(
        role: :agent,
        custom_role: create(:custom_role, account: account, permissions: %w[conversation_participating_manage])
      )
    end

    it 'does not widen the authorized scope' do
      mine = create(:conversation, account: account, inbox: inbox, assignee: agent)
      unrelated = create(:conversation, account: account, inbox: inbox, assignee: other_agent)

      result = described_class.new(agent, { status: 'open', needs_reply: 'true' }).perform

      expect(result[:conversations].map(&:id)).to contain_exactly(mine.id)
      expect(result[:conversations].map(&:id)).not_to include(unrelated.id)
    end

    it 'keeps needs_reply_count inside the custom-role scope and independent of the param' do
      create(:conversation, account: account, inbox: inbox, assignee: agent)
      create(:conversation, account: account, inbox: inbox, assignee: other_agent)

      filtered = described_class.new(agent, { status: 'open', needs_reply: 'true' }).perform_meta_only[:count]
      unfiltered = described_class.new(agent, { status: 'open' }).perform_meta_only[:count]

      expect(filtered).to eq(unfiltered)
      expect(filtered[:all_count]).to eq 1
      expect(filtered[:needs_reply_count]).to eq 1
    end
  end
end
