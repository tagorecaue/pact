pact v1

@C checkout.complete 1.0.0
  domain commerce.orders
  author translator:claude-opus@4
  created 2026-03-13T14:00:00Z
  tags checkout saga critical multi-step

@I
  natural "Execute full checkout: reserve stock, charge payment, create shipment"
  goal order.status = completed & payment.captured & shipment.created
  accept
    "Stock reserved for all items"
    "Payment captured for the full amount"
    "Shipment created with label and tracking code"
    "Confirmation email sent to customer"
  reject
    "Charge without stock reservation"
    "Create shipment without confirmed payment"
    "Leave pending reservation if payment fails"
  priority critical
  timeout 60s

@E
  order
    id id ~
    customer_id ref[customer] !
    items list[order_item] !
    total_cents int !
    status enum(pending,processing,completed,failed,cancelled) =pending
    payment_id ref[payment] ?
    shipment_id ref[shipment] ?
    created_at ts ~
  order_item
    product_id ref[product] !
    quantity int !
    unit_price_cents int !
  shipment
    id id ~
    order_id ref[order] !
    tracking_code str ?
    label_url str ?
    carrier str ?
    status enum(pending,shipped,delivered) =pending

@D
  #inventory.reserve >=1.0.0
  #payment.process >=2.0.0
  #customer.create >=1.0.0

@K
  order.total_cents > 0
    severity fatal
    message "Order total must be positive"
  forall item in order.items : item.quantity > 0
    severity fatal
    message "Quantity must be positive"
  forall item in order.items : item.unit_price_cents > 0
    severity fatal
    message "Unit price must be positive"
  order.total_cents = sum(item.quantity * item.unit_price_cents for item in order.items)
    severity fatal
    message "Total does not match sum of line items"

@X
  -- Saga: each step has compensation
  update_order status processing
  @> #inventory.reserve
    bind items <- order.items
    timeout 5s
    expect reservation.status = active
    compensate @> #inventory.release
  > @> #payment.process
    bind amount_cents <- order.total_cents
    bind customer_id <- order.customer_id
    bind method <- payment_method
    timeout 30s
    expect payment.status = captured
    compensate @> #payment.refund
  > create_shipment order
    >> generate_label
    >> get_tracking_code
    compensate cancel_shipment
  > update_order status completed
  > persist order
  > emit order.completed
    ~> send_confirmation_email customer order
    ~> notify_warehouse shipment
    ~> track_analytics order

@F
  on inventory_insufficient
    update_order status failed
    abort "Insufficient stock"
  on payment_declined
    update_order status failed
    abort "Payment declined"
  on shipment_error
    retry 2 backoff fixed base 5s
    escalate ops_team via slack

@V
  -- filled post-execution
