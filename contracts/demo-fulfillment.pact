pact v1

@C demo.fulfillment 1.0.0
  domain demo.logistics
  author pact:demo
  created 2026-03-15T00:00:00Z
  tags demo negotiation

@I
  natural "Fulfillment service managing inventory and shipping"
  goal fulfillment.operational

@E
  stock
    sku str !
    product_name str !
    qty_available int !
    warehouse str ?
  shipment
    tracking str ~
    carrier str !
    label_url str ?
    eta str ?

@N
  offers
    inventory
      fields [sku, product_name, qty_available, warehouse]
      operations [check, reserve, release]
    shipping
      fields [tracking, carrier, label_url, eta]
      operations [create_shipment, get_status]

  accepts
    orders
      needs [order_id, items, destination_address]
      provides [fulfillment_id, status]

  trust_levels
    locked
      "Never ship without payment confirmation"
      "Maximum 500 requests per minute"
    negotiable
      "Field mapping between systems"
      "Retry policies for failed shipments"
    free
      "Response format"
      "Caching strategy for stock queries"
