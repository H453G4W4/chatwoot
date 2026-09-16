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

  describe '.excluded? with subject only rules' do
    # The configuration we actually ship: no sender, so it cannot be defeated by Reply-To rewriting.
    let(:production_rules) do
      %([{"subject_contains":"You've got a new order:"},{"subject_contains":"has been cancelled"}])
    end

    it 'matches a new order notification from any sender' do
      with_modified_env NEEDS_REPLY_EXCLUDED_EMAIL_RULES: production_rules do
        expect(described_class.excluded?(sender_email: 'admin@evestv.com', subject: order_subject)).to be true
        expect(described_class.excluded?(sender_email: 'buyer@example.com', subject: order_subject)).to be true
      end
    end

    it 'matches a cancelled order notification' do
      subject = '[Evestv #1 The Best IPTV Subscription]: Order #12252 has been cancelled'

      with_modified_env NEEDS_REPLY_EXCLUDED_EMAIL_RULES: production_rules do
        expect(described_class.excluded?(sender_email: 'admin@evestv.com', subject: subject)).to be true
      end
    end

    it 'does not match a contact form subject' do
      with_modified_env NEEDS_REPLY_EXCLUDED_EMAIL_RULES: production_rules do
        expect(
          described_class.excluded?(sender_email: 'admin@evestv.com', subject: 'Contact form: I need help')
        ).to be false
      end
    end

    it 'matches even when the sender is unknown' do
      with_modified_env NEEDS_REPLY_EXCLUDED_EMAIL_RULES: production_rules do
        expect(described_class.excluded?(sender_email: nil, subject: order_subject)).to be true
      end
    end

    it 'compares the subject case insensitively' do
      with_modified_env NEEDS_REPLY_EXCLUDED_EMAIL_RULES: %([{"subject_contains":"YOU'VE GOT A NEW ORDER:"}]) do
        expect(described_class.excluded?(sender_email: 'admin@evestv.com', subject: order_subject)).to be true
      end
    end

    it 'ignores surrounding whitespace on the rule and on the subject' do
      with_modified_env NEEDS_REPLY_EXCLUDED_EMAIL_RULES: %([{"subject_contains":"  has been cancelled  "}]) do
        expect(described_class.excluded?(sender_email: 'admin@evestv.com', subject: '  Order #1 has been cancelled  ')).to be true
      end
    end

    it 'ignores a sender only rule, so a sender is never excluded on its own' do
      with_modified_env NEEDS_REPLY_EXCLUDED_EMAIL_RULES: %([{"from":"admin@evestv.com"}]) do
        expect(described_class.excluded?(sender_email: 'admin@evestv.com', subject: order_subject)).to be false
        expect(described_class.excluded?(sender_email: 'admin@evestv.com', subject: 'anything at all')).to be false
      end
    end

    it 'still requires both fields when a rule declares a sender' do
      with_modified_env NEEDS_REPLY_EXCLUDED_EMAIL_RULES: order_rule do
        expect(described_class.excluded?(sender_email: 'admin@evestv.com', subject: order_subject)).to be true
        expect(described_class.excluded?(sender_email: 'buyer@example.com', subject: order_subject)).to be false
        expect(described_class.excluded?(sender_email: 'admin@evestv.com', subject: 'Contact form: I need help')).to be false
      end
    end
  end

  describe '.excluded? with subject_contains_all rules' do
    # "has been cancelled" alone would hide a genuine customer email, so the shipped rule pairs it
    # with "order #".
    let(:production_rules) do
      %([{"subject_contains":"You've got a new order:"},) +
        %({"subject_contains_all":["order #","has been cancelled"]}])
    end
    let(:cancelled_subject) { '[Evestv #1 The Best IPTV Subscription] Order #12252 has been cancelled' }

    it 'matches a WooCommerce cancelled order subject, which carries both fragments' do
      with_modified_env NEEDS_REPLY_EXCLUDED_EMAIL_RULES: production_rules do
        expect(described_class.excluded?(sender_email: 'admin@evestv.com', subject: cancelled_subject)).to be true
      end
    end

    it 'does not match a customer email that carries only one fragment' do
      with_modified_env NEEDS_REPLY_EXCLUDED_EMAIL_RULES: production_rules do
        expect(
          described_class.excluded?(sender_email: 'customer@example.com',
                                    subject: 'my subscription has been cancelled, please help')
        ).to be false
      end
    end

    it 'still matches the new order rule alongside it' do
      with_modified_env NEEDS_REPLY_EXCLUDED_EMAIL_RULES: production_rules do
        expect(described_class.excluded?(sender_email: 'admin@evestv.com', subject: order_subject)).to be true
      end
    end

    it 'does not match a contact form subject' do
      with_modified_env NEEDS_REPLY_EXCLUDED_EMAIL_RULES: production_rules do
        expect(
          described_class.excluded?(sender_email: 'admin@evestv.com', subject: 'Contact form: I need help')
        ).to be false
      end
    end

    it 'compares every fragment case insensitively and trimmed' do
      rule = %([{"subject_contains_all":["  ORDER #  ","  HAS BEEN CANCELLED  "]}])

      with_modified_env NEEDS_REPLY_EXCLUDED_EMAIL_RULES: rule do
        expect(described_class.excluded?(sender_email: 'admin@evestv.com', subject: "  #{cancelled_subject}  ")).to be true
      end
    end

    it 'still requires the sender when a rule declares one' do
      rule = %([{"from":"admin@evestv.com","subject_contains_all":["order #","has been cancelled"]}])

      with_modified_env NEEDS_REPLY_EXCLUDED_EMAIL_RULES: rule do
        expect(described_class.excluded?(sender_email: 'admin@evestv.com', subject: cancelled_subject)).to be true
        expect(described_class.excluded?(sender_email: 'buyer@example.com', subject: cancelled_subject)).to be false
      end
    end

    it 'ignores a sender only rule that carries an empty fragment list' do
      with_modified_env NEEDS_REPLY_EXCLUDED_EMAIL_RULES: %([{"from":"admin@evestv.com","subject_contains_all":[]}]) do
        expect(described_class.rules).to eq []
        expect(described_class.excluded?(sender_email: 'admin@evestv.com', subject: cancelled_subject)).to be false
      end
    end

    it 'requires both keys when a rule declares subject_contains and subject_contains_all' do
      rule = %([{"subject_contains":"evestv","subject_contains_all":["order #","has been cancelled"]}])

      with_modified_env NEEDS_REPLY_EXCLUDED_EMAIL_RULES: rule do
        expect(described_class.excluded?(sender_email: 'a@b.com', subject: cancelled_subject)).to be true
        expect(described_class.excluded?(sender_email: 'a@b.com', subject: 'Order #1 has been cancelled')).to be false
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

    it 'keeps a subject only rule and leaves its sender unset' do
      with_modified_env NEEDS_REPLY_EXCLUDED_EMAIL_RULES: %([{"subject_contains":"You've got a new order:"}]) do
        expect(described_class.rules).to eq [{ from: nil, subject_fragments: ["you've got a new order:"] }]
      end
    end

    it 'treats a blank sender as an unset one' do
      with_modified_env NEEDS_REPLY_EXCLUDED_EMAIL_RULES: %([{"from":"  ","subject_contains":"has been cancelled"}]) do
        expect(described_class.rules).to eq [{ from: nil, subject_fragments: ['has been cancelled'] }]
      end
    end

    it 'drops a rule whose subject fragments are all blank' do
      with_modified_env NEEDS_REPLY_EXCLUDED_EMAIL_RULES: %([{"subject_contains_all":["","  "]}]) do
        expect(described_class.rules).to eq []
      end
    end

    it 'keeps every fragment of a subject_contains_all rule' do
      with_modified_env NEEDS_REPLY_EXCLUDED_EMAIL_RULES: %([{"subject_contains_all":["Order #","Has Been Cancelled"]}]) do
        expect(described_class.rules).to eq [{ from: nil, subject_fragments: ['order #', 'has been cancelled'] }]
      end
    end

    it 'drops entries that are not objects while keeping the valid ones' do
      rule = %(["nonsense",{"from":"admin@evestv.com","subject_contains":"You've got a new order:"}])

      with_modified_env NEEDS_REPLY_EXCLUDED_EMAIL_RULES: rule do
        expect(described_class.rules).to eq [{ from: 'admin@evestv.com', subject_fragments: ["you've got a new order:"] }]
      end
    end
  end
end
