# Matches inbound notification emails - order confirmations and the like - that must not raise
# "Needs Reply", even though the same sender also sends genuine customer messages.
#
# Configured through the NEEDS_REPLY_EXCLUDED_EMAIL_RULES environment variable, a JSON array:
#
#   [{"subject_contains":"You've got a new order:"},
#    {"subject_contains_all":["order #","has been cancelled"]}]
#
# A rule must carry at least one subject fragment, given as `subject_contains` (one substring)
# or `subject_contains_all` (an array of substrings that must ALL appear - use it when a single
# phrase would be too broad to be safe). A rule may carry both; every fragment it declares has
# to appear. `from` is optional: when a rule carries one, the sender address must equal it
# exactly as well. All comparisons are case-insensitive with surrounding whitespace ignored.
#
# A rule with no subject fragment is dropped, so a sender is never excluded on its own.
# A missing, empty, malformed or non-array value simply matches nothing.
#
# `from` is matched against the address Chatwoot attributes the email to - the conversation's
# contact - which upstream resolves Reply-To first and only then From (MailPresenter#original_sender).
# So write the rule with the address the inbox shows as the contact, not necessarily the From
# header; a subject-only rule sidesteps that distinction entirely.
#
# Only the sender address and the subject are ever read; the message body is never inspected.
module NeedsReplyExclusion
  ENV_KEY = 'NEEDS_REPLY_EXCLUDED_EMAIL_RULES'.freeze

  module_function

  def excluded?(sender_email:, subject:)
    subject = normalize(subject)
    return false if subject.blank?

    from = normalize(sender_email)
    rules.any? { |rule| rule_matches?(rule, from, subject) }
  end

  def rule_matches?(rule, from, subject)
    return false unless rule[:subject_fragments].all? { |fragment| subject.include?(fragment) }

    rule[:from].nil? || rule[:from] == from
  end

  def rules
    raw = ENV.fetch(ENV_KEY, nil)
    return [] if raw.blank?

    parsed = JSON.parse(raw)
    return [] unless parsed.is_a?(Array)

    parsed.filter_map { |rule| normalized_rule(rule) }
  rescue JSON::ParserError
    []
  end

  def normalized_rule(rule)
    return nil unless rule.is_a?(Hash)

    fragments = subject_fragments(rule)
    return nil if fragments.empty?

    { from: normalize(rule['from']).presence, subject_fragments: fragments }
  end

  def subject_fragments(rule)
    values = Array.wrap(rule['subject_contains']) + Array.wrap(rule['subject_contains_all'])
    values.filter_map { |value| normalize(value).presence }
  end

  def normalize(value)
    value.to_s.strip.downcase
  end
end
