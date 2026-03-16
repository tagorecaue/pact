pact v1

-- Connector: Telegram Bot API
@C connector.telegram 1.0.0
  domain connectors.messaging
  author connector:community
  tags messaging telegram bot chatbot

@I
  natural "Connector for the Telegram Bot API"
  goal connector.operational

@S telegram
  base_url "https://api.telegram.org/bot{token}"
  auth
    type bearer_token
    env TELEGRAM_BOT_TOKEN
  rate_limit 30/sec
  retry_on 429 500 502 503

  operations
    send_message
      method POST
      path "/sendMessage"
      intent "Send a text message to a chat"
      input
        chat_id str !
        text str !
        parse_mode str =HTML
        disable_notification bool ?
      output
        ok bool
        message_id int
        chat_id str
      errors
        chat_not_found
          action abort "Chat not found"
        rate_limited
          action retry "Rate limit exceeded"

    get_updates
      method GET
      path "/getUpdates"
      intent "Retrieve incoming updates via long polling"
      input
        offset int ?
        limit int =100
        timeout int =30
      output
        ok bool
        result list
      errors
        conflict
          action abort "Webhook is active, cannot use getUpdates"

    send_photo
      method POST
      path "/sendPhoto"
      intent "Send a photo to a chat"
      input
        chat_id str !
        photo str !
        caption str ?
        parse_mode str =HTML
      output
        ok bool
        message_id int
      errors
        file_too_large
          action abort "Photo exceeds 10MB limit"

    delete_message
      method POST
      path "/deleteMessage"
      intent "Delete a message from a chat"
      input
        chat_id str !
        message_id int !
      output
        ok bool
      errors
        message_not_found
          action abort "Message not found or already deleted"
