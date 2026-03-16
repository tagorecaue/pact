pact v1

-- Connector: Twilio communications
@C connector.twilio 1.0.0
  domain connectors.sms
  author connector:community
  tags sms voice twilio communications

@I
  natural "Connector for Twilio SMS and voice services"
  goal connector.operational

@S twilio
  base_url "https://api.twilio.com/2010-04-01/Accounts/{account_sid}"
  auth
    type basic
    env TWILIO_AUTH_TOKEN
  rate_limit 100/sec
  retry_on 429 500 502 503

  operations
    send_sms
      method POST
      path "/Messages.json"
      intent "Send an SMS message"
      input
        to str !
        from str !
        body str !
        status_callback str ?
      output
        sid str
        status str
        to str
        from str
        date_created str
      errors
        invalid_number
          action abort "Invalid phone number"
        insufficient_funds
          action abort "Account balance too low"
        rate_limited
          action retry "Rate limit exceeded"

    make_call
      method POST
      path "/Calls.json"
      intent "Initiate a phone call"
      input
        to str !
        from str !
        url str !
        method str =POST
        timeout int =30
      output
        sid str
        status str
        to str
        from str
      errors
        invalid_number
          action abort "Invalid phone number"
        number_not_verified
          action abort "Caller ID not verified"

    get_message_status
      method GET
      path "/Messages/{message_sid}.json"
      intent "Check the delivery status of a message"
      input
        message_sid str !
      output
        sid str
        status str
        to str
        from str
        date_sent str
        error_code str
      errors
        not_found
          action abort "Message not found"
