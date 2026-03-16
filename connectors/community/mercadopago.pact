pact v1

-- Connector: Mercado Pago payment platform
@C connector.mercadopago 1.0.0
  domain connectors.payments
  author connector:community
  tags payment mercadopago latam

@I
  natural "Connector for the Mercado Pago payment platform"
  goal connector.operational

@S mercadopago
  base_url "https://api.mercadopago.com"
  auth
    type bearer_token
    env MERCADOPAGO_ACCESS_TOKEN
  rate_limit 50/sec
  retry_on 429 500 502 503

  operations
    create_payment
      method POST
      path "/v1/payments"
      intent "Create a new payment"
      input
        transaction_amount dec !
        description str !
        payment_method_id str !
        payer_email str !
        installments int =1
      output
        id int
        status str
        status_detail str
        transaction_amount dec
      errors
        invalid_payment_method
          action abort "Invalid payment method"
        rejected
          action abort "Payment rejected"

    create_preference
      method POST
      path "/checkout/preferences"
      intent "Create a checkout preference for redirect flow"
      input
        title str !
        unit_price dec !
        quantity int =1
        currency_id str =BRL
        back_urls_success str ?
        back_urls_failure str ?
      output
        id str
        init_point str
        sandbox_init_point str
      errors
        invalid_items
          action abort "Invalid item configuration"

    get_payment
      method GET
      path "/v1/payments/{payment_id}"
      intent "Retrieve payment status"
      input
        payment_id str !
      output
        id int
        status str
        status_detail str
        transaction_amount dec
        date_approved str
      errors
        not_found
          action abort "Payment not found"
