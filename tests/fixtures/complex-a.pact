pact v1

@C inventory.reserve 1.0.0
  domain commerce.inventory
  author translator:claude-opus@4
  created 2026-03-13T14:00:00Z
  tags inventory atomic

@I
  natural "Reserve stock for order items"
  goal forall item in items : item.reserved = true
  accept
    "Each item has sufficient stock"
    "Reservation created with 15-minute TTL"
  reject
    "Reserve more than available stock"
    "Create reservation without TTL"
  timeout 5s

@E
  reservation
    id id ~
    order_id ref[order] !
    items list[reservation_item] !
    status enum(active,confirmed,released,expired) =active
    expires_at ts !
    created_at ts ~
  reservation_item
    product_id ref[product] !
    quantity int !
    warehouse_id ref[warehouse] ?

@K
  forall item in items : item.quantity > 0
    severity fatal
    message "Quantity must be positive"
  forall item in items : stock(item.product_id) >= item.quantity
    severity fatal
    message "Insufficient stock"
  reservation.expires_at > now
    severity fatal
    message "Reservation must have future TTL"

@X
  * has_next_item max 500
    check_stock item.product_id item.quantity
    ? stock_sufficient
      reserve_item item.product_id item.quantity
    ?!
      release_all_reserved
      abort "Insufficient stock for {item.product_id}"
  set_expiration reservation 15m
  persist reservation
  emit inventory.reserved

@F
  on stock_changed_during_reserve
    release_all_reserved
    retry 1
  on db_error
    release_all_reserved
    abort "Stock reservation failed"

@V
  -- filled post-execution
