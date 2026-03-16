pact v1

@C demo.store 1.0.0
  domain demo.commerce
  author pact:demo
  created 2026-03-15T00:00:00Z
  tags demo negotiation

@I
  natural "Online store that needs inventory and shipping services"
  goal orders.fulfilled

@E
  order
    id id ~
    customer_id str !
    items list[str] !
    total_cents int !
    status str =pending

@N
  offers
    orders
      fields [id, customer_id, items, total_cents, status, created_at]
      operations [read, webhook]

  accepts
    inventory
      needs [product_id, quantity]
      provides [available, reserved_until]
    shipping
      needs [address, weight_grams, items]
      provides [tracking_code, estimated_delivery, cost_cents]

  trust_levels
    locked
      "Never expose customer payment data externally"
      "Never accept writes to order data from external services"
    negotiable
      "Field naming conventions between systems"
      "Date and currency formats"
      "Retry and timeout policies"
    free
      "Response compression format"
      "Batch request size"
