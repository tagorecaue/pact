pact v1

@C customer.create 1.0.0
  domain demo.customers
  author pact:cli
  created 2026-03-14T00:00:00Z
  tags demo api

@T
  http POST /api/customers

@I
  natural "Register a new customer via API"
  goal customer.persisted
  accept
    "Customer saved with generated ID"
    "customer.created event emitted"
  reject
    "Register without email"
    "Register without name"
  priority normal
  timeout 10s

@E
  customer
    id id ~
    email str !
    name str !
    company str ?
    status str =active
    created_at ts ~

@K
  email min 3
    severity fatal
    message "Email is required"
  name min 1
    severity fatal
    message "Name is required"

@X
  validate email name
  generate_id
  set status active
  persist customer
  emit customer.created
