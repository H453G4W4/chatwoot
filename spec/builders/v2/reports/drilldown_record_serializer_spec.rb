require 'rails_helper'

RSpec.describe V2::Reports::DrilldownRecordSerializer do
  subject(:serializer) { described_class.new(account, 'conversations_count', false) }

  let(:account) { create(:account) }
  let(:inbox) { create(:inbox, account: account) }
  let(:conversation) { create(:conversation, account: account, inbox: inbox) }
  let(:sub_second) { Time.zone.parse('2024-05-05 10:00:00.654321') }

  describe '#serialize' do
    before do
      # rubocop:disable Rails/SkipsModelValidations
      conversation.update_columns(last_activity_at: sub_second)
      # rubocop:enable Rails/SkipsModelValidations
      conversation.reload
    end

    it 'serializes conversation last_activity_at as a fractional epoch' do
      payload = serializer.serialize(conversation)

      expect(payload[:conversation][:last_activity_at]).to be_within(0.000_01).of(sub_second.to_f)
      expect(payload[:conversation][:last_activity_at]).not_to eq(sub_second.to_i)
    end

    it 'leaves created_at as a whole-second epoch' do
      payload = serializer.serialize(conversation)

      expect(payload[:conversation][:created_at]).to eq(conversation.created_at.to_i)
    end
  end
end
