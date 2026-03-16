pact v1

-- Connector: Resend email delivery
@C connector.resend 1.0.0
  domain connectors.email
  author connector:community
  tags email transactional notification

@I
  natural "Connector for sending transactional emails via Resend"
  goal connector.operational

@S resend
  base_url "https://api.resend.com"
  auth
    type bearer_token
    env RESEND_API_KEY
  rate_limit 10/sec
  retry_on 429 500 502 503

  operations
    send_email
      method POST
      path "/emails"
      intent "Send a transactional email"
      input
        from str !
        to str !
        subject str !
        html str ?
        text str ?
        reply_to str ?
        cc str ?
        bcc str ?
      output
        id str
      errors
        validation_error
          action abort "Invalid email data"
        sender_not_verified
          action abort "Sender domain not verified"
        rate_limited
          action retry "Rate limit exceeded"

    get_batch
      method GET
      path "/emails/{batch_id}"
      intent "Check the status of a sent email batch"
      input
        batch_id str !
      output
        id str
        from str
        to str
        subject str
        created_at str
      errors
        not_found
          action abort "Batch not found"
