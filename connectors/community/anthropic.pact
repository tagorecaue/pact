pact v1

-- Connector: Anthropic API
@C connector.anthropic 1.0.0
  domain connectors.ai
  author connector:community
  tags ai llm anthropic claude

@I
  natural "Connector for the Anthropic Messages API"
  goal connector.operational

@S anthropic
  base_url "https://api.anthropic.com/v1"
  auth
    type api_key
    env ANTHROPIC_API_KEY
  rate_limit 60/min
  retry_on 429 500 502 503 529

  operations
    create_message
      method POST
      path "/messages"
      intent "Create a message using Claude"
      input
        model str =claude-sonnet-4-20250514
        max_tokens int =1024
        messages list !
        system str ?
        temperature dec =1.0
        stream bool =false
      output
        id str
        type str
        role str
        content list
        model str
        stop_reason str
        usage_input_tokens int
        usage_output_tokens int
      errors
        invalid_request
          action abort "Invalid request parameters"
        overloaded
          action retry "API is overloaded"
        rate_limited
          action retry "Rate limit exceeded"

    count_tokens
      method POST
      path "/messages/count_tokens"
      intent "Count the number of tokens in a message"
      input
        model str !
        messages list !
        system str ?
      output
        input_tokens int
      errors
        invalid_request
          action abort "Invalid request parameters"

    list_models
      method GET
      path "/models"
      intent "List available models"
      input
        limit int =20
      output
        data list
        has_more bool
      errors
        forbidden
          action abort "Invalid API key"
