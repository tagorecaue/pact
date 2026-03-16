pact v1

-- Connector: WhatsApp Business API
@C connector.whatsapp 1.0.0
  domain connectors.messaging
  author connector:community
  tags messaging whatsapp business

@I
  natural "Connector for the WhatsApp Business Cloud API"
  goal connector.operational

@S whatsapp
  base_url "https://graph.facebook.com/v18.0"
  auth
    type bearer_token
    env WHATSAPP_TOKEN
  rate_limit 80/sec
  retry_on 429 500 502 503

  operations
    send_message
      method POST
      path "/{phone_number_id}/messages"
      intent "Send a text message via WhatsApp"
      input
        phone_number_id str !
        to str !
        type str =text
        text str !
      output
        messaging_product str
        message_id str
      errors
        invalid_recipient
          action abort "Recipient phone number is invalid"
        rate_limited
          action retry "Rate limit exceeded"

    send_template
      method POST
      path "/{phone_number_id}/messages"
      intent "Send a pre-approved template message"
      input
        phone_number_id str !
        to str !
        template_name str !
        language_code str =en_US
        components list ?
      output
        messaging_product str
        message_id str
      errors
        template_not_found
          action abort "Template not found or not approved"
        invalid_parameters
          action abort "Template parameters do not match"
