pact v1

-- Connector: Slack API
@C connector.slack 1.0.0
  domain connectors.messaging
  author connector:community
  tags messaging slack notification

@I
  natural "Connector for the Slack messaging platform"
  goal connector.operational

@S slack
  base_url "https://slack.com/api"
  auth
    type bearer_token
    env SLACK_BOT_TOKEN
  rate_limit 50/min
  retry_on 429 500 502 503

  operations
    post_message
      method POST
      path "/chat.postMessage"
      intent "Send a message to a Slack channel or user"
      input
        channel str !
        text str !
        blocks list ?
        thread_ts str ?
        unfurl_links bool =true
      output
        ok bool
        ts str
        channel str
      errors
        channel_not_found
          action abort "Slack channel not found"
        not_in_channel
          action abort "Bot is not in this channel"
        rate_limited
          action retry "Rate limit exceeded"

    create_channel
      method POST
      path "/conversations.create"
      intent "Create a new Slack channel"
      input
        name str !
        is_private bool =false
        description str ?
      output
        ok bool
        channel_id str
        channel_name str
      errors
        name_taken
          action abort "Channel name already exists"
        restricted
          action abort "Insufficient permissions"

    upload_file
      method POST
      path "/files.upload"
      intent "Upload a file to a Slack channel"
      input
        channels str !
        content str !
        filename str !
        title str ?
        filetype str ?
      output
        ok bool
        file_id str
        permalink str
      errors
        file_too_large
          action abort "File exceeds size limit"
