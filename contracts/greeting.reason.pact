pact v1

@C greeting.reason 1.0.0
  domain demo
  author pact:cli
  created 2026-03-15T00:00:00Z
  tags demo reasoning ai

@I
  natural "Generate a personalized greeting based on user data"
  goal greeting.generated
  timeout 60s

@E
  greeting
    id id ~
    name str !
    language str ?
    message str ~
    created_at ts ~

@K
  name min 1
    severity fatal
    message "Name is required"

@R
  objective "Create a personalized greeting message for the user, considering their name and preferred language"
  strategy
    prefer short_greeting when language = unknown
    prefer native_greeting when language = known
  freedom
    choose_format true
    choose_tone true
  locked
    always include_name
    never use_offensive_language
