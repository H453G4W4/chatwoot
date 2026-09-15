# Matches inbound notification emails - order confirmations and the like - that must not raise
# "Needs Reply", even though the same sender also sends genuine customer messages.
#
# Configured through the NEEDS_REPLY_EXCLUDED_EMAIL_RULES environment variable, a JSON array:
#
#   [{"from":"admin@evestv.com","subject_contains":"You've got a new order:"}]
#
# A rule matches when the sender address is exactly `from` and the subject contains
# `subject_contains`, both compared case-insensitively with surrounding whitespace ignored.
# Both fields are required, so a sender is never excluded on its own, and every field of a
# rule must match. A missing, empty, malformed or non-array value simply matches nothing.
#
# `from` is matched against the address Chatwoot attributes the email to - the conversation's
# contact - which upstream resolves Reply-To first and only then From (MailPresenter#original_sender).
# So write the rule with the address the inbox shows as the contact, not necessarily the From header.
#
# Only the sender address and the subject are ever read; the message body is never inspected.
module NeedsReplyExclusion
  ENV_KEY = 'NEEDS_REPLY_EXCLUDED_EMAIL_RULES'.freeze

  module_function

  def excluded?(sender_email:, subject:)
    from = normalize(sender_email)
    subject = normalize(subject)
    return false if from.blank? || subject.blank?

    rules.any? { |rule| rule[:from] == from && subject.include?(rule[:subject_contains]) }
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

    from = normalize(rule['from'])
    subject_contains = normalize(rule['subject_contains'])
    return nil if from.blank? || subject_contains.blank?

    { from: from, subject_contains: subject_contains }
  end

  def normalize(value)
    value.to_s.strip.downcase
  end
end
