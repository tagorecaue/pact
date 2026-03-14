pact v1

@C payment.process 2.0.0
  domain finance.payments
  author translator:claude-opus@4
  created 2026-03-13T14:00:00Z
  tags payment stripe critical

@I
  natural "Process payment via Stripe for an order"
  goal payment.captured & payment.amount = order.total
  accept
    "Payment authorized and captured for the correct amount"
    "Payment receipt generated"
  reject
    "Capture amount different from order total"
    "Process payment without active stock reservation"
  timeout 30s

@E
  payment
    id id ~
    order_id ref[order] !
    customer_id ref[customer] !
    amount_cents int !
    currency str =BRL
    method enum(credit_card,pix,boleto) !
    stripe_payment_id str ~
    status enum(pending,authorized,captured,failed,refunded) =pending
    captured_at ts ?
    receipt_url str ?

@D
  #inventory.reserve >=1.0.0
    bind reservation.status = active

@K
  amount_cents > 0
    severity fatal
    message "Amount must be positive"
  amount_cents = order.total_cents
    severity fatal
    message "Payment amount must equal order total"

@X
  validate_order_total order
  ?? method
    credit_card
      <> stripe.payment_intents.create
        send amount_cents currency customer.stripe_id
        receive stripe_payment_id client_secret
      >> <> stripe.payment_intents.confirm
        send stripe_payment_id payment_method_id
        receive status
      ? status = succeeded
        update_payment status captured captured_at now
      ?!
        update_payment status failed
        abort "Payment declined by issuer"
    pix
      <> stripe.payment_intents.create
        send amount_cents currency customer.stripe_id method pix
        receive stripe_payment_id pix_qr_code pix_expiration
      emit payment.pix_generated
        ~> notify_customer pix_qr_code pix_expiration
    boleto
      <> stripe.payment_intents.create
        send amount_cents currency customer.stripe_id method boleto
        receive stripe_payment_id boleto_url boleto_expiration
      emit payment.boleto_generated
        ~> notify_customer boleto_url boleto_expiration
  persist payment
  emit payment.processed

@F
  on stripe_timeout
    retry 3 backoff exponential base 2s
  on stripe_card_declined
    abort "Card declined"
  on stripe_insufficient_funds
    abort "Insufficient funds"

@V
  -- filled post-execution
