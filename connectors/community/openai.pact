pact v1

-- Connector: OpenAI API
@C connector.openai 1.0.0
  domain connectors.ai
  author connector:community
  tags ai llm openai gpt

@I
  natural "Connector for the OpenAI API"
  goal connector.operational

@S openai
  base_url "https://api.openai.com/v1"
  auth
    type bearer_token
    env OPENAI_API_KEY
  rate_limit 60/min
  retry_on 429 500 502 503

  operations
    chat_completion
      method POST
      path "/chat/completions"
      intent "Create a chat completion"
      input
        model str =gpt-4o
        messages list !
        temperature dec =1.0
        max_tokens int ?
        stream bool =false
      output
        id str
        object str
        model str
        choices list
        usage_prompt_tokens int
        usage_completion_tokens int
      errors
        invalid_request
          action abort "Invalid request parameters"
        rate_limited
          action retry "Rate limit exceeded"
        context_length
          action abort "Maximum context length exceeded"

    create_embedding
      method POST
      path "/embeddings"
      intent "Create text embeddings"
      input
        model str =text-embedding-3-small
        input str !
        encoding_format str =float
      output
        object str
        data list
        model str
        usage_total_tokens int
      errors
        invalid_input
          action abort "Invalid input text"

    create_image
      method POST
      path "/images/generations"
      intent "Generate an image from a text prompt"
      input
        model str =dall-e-3
        prompt str !
        size str =1024x1024
        quality str =standard
        n int =1
      output
        created int
        data list
      errors
        content_policy
          action abort "Prompt violates content policy"
        rate_limited
          action retry "Rate limit exceeded"
