require 'rails_helper'

describe NeedsReplyExclusion do
  let(:order_rule) { %([{"from":"admin@evestv.com","subject_contains":"You've got a new order:"}]) }
  let(:order_subject) { "[Evestv #1 The Best IPTV Subscription | 38K+ 4D & 8K Channels]: You've got a new order: #12252" }

  describe '.excluded?' do
    it 'matches a configured sender and subject fragment' do
      with_modified_env NEEDS_REPLY_EXCLUDED_EMAIL_RULES: order_rule do
        expect(described_class.excluded?(sender_email: 'admin@evestv.com', subject: order_subject)).to be true
      end
    end

    it 'does not match the same sender on a different subject' do
      with_modified_env NEEDS_REPLY_EXCLUDED_EMAIL_RULES: order_rule do
        expect(
          described_class.excluded?(sender_email: 'admin@evestv.com', subject: 'Contact form: I need help')
        ).to be false
      end
    end

    it 'does not match the same subject from a different sender' do
      with_modified_env NEEDS_REPLY_EXCLUDED_EMAIL_RULES: order_rule do
        expect(described_class.excluded?(sender_email: 'customer@example.com', subject: order_subject)).to be false
      end
    end

    it 'compares the sender and the subject case insensitively' do
      rule = %([{"from":"ADMIN@EVESTV.COM","subject_contains":"YOU'VE GOT A NEW ORDER:"}])

      with_modified_env NEEDS_REPLY_EXCLUDED_EMAIL_RULES: rule do
        expect(described_class.excluded?(sender_email: 'Admin@EvesTV.com', subject: order_subject)).to be true
      end
    end

    it 'ignores surrounding whitespace on the rule and on the message' do
      rule = %([{"from":"  admin@evestv.com  ","subject_contains":"  You've got a new order:  "}])

      with_modified_env NEEDS_REPLY_EXCLUDED_EMAIL_RULES: rule do
        expect(described_class.excluded?(sender_email: " admin@evestv.com\n", subject: "  #{order_subject}  ")).to be true
      end
    end

    it 'matches against any rule in the array' do
      rule = %([{"from":"billing@example.com","subject_contains":"Invoice"},) +
             %({"from":"admin@evestv.com","subject_contains":"You've got a new order:"}])

      with_modified_env NEEDS_REPLY_EXCLUDED_EMAIL_RULES: rule do
        expect(described_class.excluded?(sender_email: 'admin@evestv.com', subject: order_subject)).to be true
      end
    end

    it 'returns false when the sender is blank' do
      with_modified_env NEEDS_REPLY_EXCLUDED_EMAIL_RULES: order_rule do
        expect(described_class.excluded?(sender_email: nil, subject: order_subject)).to be false
      end
    end

    it 'returns false when the subject is blank' do
      with_modified_env NEEDS_REPLY_EXCLUDED_EMAIL_RULES: order_rule do
        expect(described_class.excluded?(sender_email: 'admin@evestv.com', subject: nil)).to be false
      end
    end

    it 'returns false when the environment variable is missing' do
      with_modified_env NEEDS_REPLY_EXCLUDED_EMAIL_RULES: nil do
        expect(described_class.excluded?(sender_email: 'admin@evestv.com', subject: order_subject)).to be false
      end
    end
  end

  describe '.rules' do
    it 'is empty when the environment variable is missing' do
      with_modified_env(NEEDS_REPLY_EXCLUDED_EMAIL_RULES: nil) { expect(described_class.rules).to eq [] }
    end

    it 'is empty when the value is blank' do
      with_modified_env(NEEDS_REPLY_EXCLUDED_EMAIL_RULES: '   ') { expect(described_class.rules).to eq [] }
    end

    it 'is empty and does not raise when the value is not valid JSON' do
      with_modified_env NEEDS_REPLY_EXCLUDED_EMAIL_RULES: 'admin@evestv.com' do
        expect { described_class.rules }.not_to raise_error
        expect(described_class.rules).to eq []
      end
    end

    it 'is empty when the value is valid JSON but not an array' do
      with_modified_env NEEDS_REPLY_EXCLUDED_EMAIL_RULES: '{"from":"admin@evestv.com"}' do
        expect(described_class.rules).to eq []
      end
    end

    it 'drops a rule that configures a sender without a subject fragment' do
      with_modified_env NEEDS_REPLY_EXCLUDED_EMAIL_RULES: %([{"from":"admin@evestv.com"}]) do
        expect(described_class.rules).to eq []
      end
    end

    it 'drops a rule that configures a subject fragment without a sender' do
      with_modified_env NEEDS_REPLY_EXCLUDED_EMAIL_RULES: %([{"subject_contains":"You've got a new order:"}]) do
        expect(described_class.rules).to eq []
      end
    end

    it 'drops entries that are not objects while keeping the valid ones' do
      rule = %(["nonsense",{"from":"admin@evestv.com","subject_contains":"You've got a new order:"}])

      with_modified_env NEEDS_REPLY_EXCLUDED_EMAIL_RULES: rule do
        expect(described_class.rules).to eq [{ from: 'admin@evestv.com', subject_contains: "you've got a new order:" }]
      end
    end
  end
end
