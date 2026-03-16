pact v1

-- Connector: SendGrid email delivery
@C connector.sendgrid 1.0.0
  domain connectors.email
  author connector:community
  tags email marketing transactional

@I
  natural "Connector for sending emails via SendGrid"
  goal connector.operational

@S sendgrid
  base_url "https://api.sendgrid.com/v3"
  auth
    type bearer_token
    env SENDGRID_API_KEY
  rate_limit 600/min
  retry_on 429 500 502 503

  operations
    send_email
      method POST
      path "/mail/send"
      intent "Send a transactional email"
      input
        to_email str !
        to_name str ?
        from_email str !
        from_name str ?
        subject str !
        content_type str =text/html
        content str !
      output
        status_code int
        message_id str
      errors
        invalid_email
          action abort "Invalid email address"
        rate_limited
          action retry "Rate limit exceeded"
        forbidden
          action abort "Sender identity not verified"

    add_contact
      method PUT
      path "/marketing/contacts"
      intent "Add or update a marketing contact"
      input
        email str !
        first_name str ?
        last_name str ?
        list_ids list ?
      output
        job_id str
      errors
        validation_error
          action abort "Invalid contact data"
