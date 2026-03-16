pact v1

-- Connector: Stripe payment processing
@C connector.stripe 1.0.0
  domain connectors.payments
  author connector:community
  tags payment stripe financial

@I
  natural "Connector for the Stripe payment processing platform"
  goal connector.operational

@S stripe
  base_url "https://api.stripe.com/v1"
  auth
    type bearer_token
    env STRIPE_API_KEY
  content_type application/x-www-form-urlencoded
  rate_limit 100/sec
  retry_on 429 500 502 503

  operations
    create_customer
      method POST
      path "/customers"
      intent "Register a new customer on Stripe"
      input
        email str !
        name str ?
        description str ?
        payment_method str ?
      output
        id str
        email str
        created int
        livemode bool
      errors
        email_invalid
          action abort "Invalid email for Stripe"
        rate_limited
          action retry "Rate limit exceeded"

    create_charge
      method POST
      path "/charges"
      intent "Create a new payment charge"
      input
        amount int !
        currency str =usd
        source str !
        description str ?
        capture bool =true
      output
        id str
        status str
        amount int
        currency str
        paid bool
      errors
        card_declined
          action abort "Payment declined by card"
        insufficient_funds
          action abort "Insufficient funds"

    create_payment_intent
      method POST
      path "/payment_intents"
      intent "Create a payment intent for modern payment flow"
      input
        amount int !
        currency str =usd
        customer str ?
        payment_method str ?
        confirm bool =false
      output
        id str
        client_secret str
        status str
        amount int
        currency str
      errors
        amount_too_small
          action abort "Minimum amount not met"

    refund
      method POST
      path "/refunds"
      intent "Refund a payment charge"
      input
        charge str !
        amount int ?
        reason str ?
      output
        id str
        status str
        amount int
        charge str
      errors
        charge_already_refunded
          action abort "Charge has already been refunded"
