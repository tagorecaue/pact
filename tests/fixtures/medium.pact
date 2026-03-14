pact v1

@C payment.webhook.stripe 1.0.0
  domain finance.payments
  author translator:claude-opus@4
  created 2026-03-13T11:00:00Z
  tags webhook stripe critical

@T
  webhook stripe payment_intent.succeeded
    verify_signature true
    secret env:STRIPE_WEBHOOK_SECRET
  webhook stripe payment_intent.payment_failed
    verify_signature true
    secret env:STRIPE_WEBHOOK_SECRET

@I
  natural "Process Stripe webhooks to update payment and subscription status"
  goal payment.status_updated & subscription.status_synced
  accept
    "Payment marked as captured when succeeded"
    "Subscription activated on first confirmed payment"
    "Subscription marked past_due when payment fails"
    "Full evidence recorded for audit"
  reject
    "Process webhook with invalid signature"
    "Update payment without verifying existence"
  priority critical
  timeout 5s

@E
  webhook_event
    id str !
    type str !
    data map[str,any] !
    created ts !
    stripe_signature str !
  payment
    id id ~
    subscription_id ref[subscription] !
    stripe_payment_id str !
    amount_cents int !
    currency str !
    status enum(pending,captured,failed,refunded) !
    captured_at ts ?
    failed_at ts ?
    failure_reason str ?
  subscription
    id id !
    status enum(trial,active,past_due,cancelled,expired) !

@K
  webhook_event.stripe_signature valid
    severity fatal
    message "Invalid webhook signature -- possible fraud"
  payment.amount_cents > 0
    severity fatal
    message "Payment amount must be positive"

@X
  verify_stripe_signature webhook_event.stripe_signature
  >> extract_payment_intent webhook_event.data
  >> find_payment_by_stripe_id stripe_payment_id
  ?? webhook_event.type
    payment_intent.succeeded
      update_payment status captured captured_at now
      >> find_subscription payment.subscription_id
      ? subscription.status = trial
        update_subscription status active
      emit payment.captured
        ~> notify_customer "Payment confirmed"
        ~> log_audit
    payment_intent.payment_failed
      update_payment status failed failed_at now failure_reason
      >> find_subscription payment.subscription_id
      update_subscription status past_due
      emit payment.failed
        ~> notify_customer "Payment failed"
        ~> notify_admin "Payment failure"
        ~> log_audit
    _
      log_unknown_event webhook_event.type
      abort "Unsupported event type"

@F
  on payment_not_found
    log_warning "Payment not found for stripe_id"
    abort "Unknown payment"
  on db_error
    retry 3 backoff exponential base 1s

@V
  -- filled post-execution by the runtime
