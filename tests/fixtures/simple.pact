pact v1

-- Contract: register a new customer
@C customer.create 1.0.0
  domain commerce.customers
  author translator:claude-opus@4
  created 2026-03-13T10:00:00Z

@I
  natural "Register new customer with email validation and Stripe sync"
  goal customer.persisted & customer.stripe_synced
  accept
    "Customer saved in database with generated ID"
    "Stripe customer created with stripe_id linked"
    "customer.created event emitted"
  reject
    "Register customer with duplicate email"
    "Save customer without Stripe sync"
  priority normal
  timeout 10s

@E
  customer
    id id ~
    email str !*^
    name str !
    company str ?
    doc str ?
    phone str ?
    stripe_id str ~
    status enum(active,inactive,blocked) =active
    created_at ts ~
    updated_at ts ~

@K
  email unique within customers
    severity fatal
    message "Email already registered"
  email matches rfc5322
    severity fatal
    message "Invalid email format"
  name min 2
    severity fatal
    message "Name must be at least 2 characters"
  doc ? doc matches cpf | doc matches cnpj
    severity fatal
    message "Invalid document: must be valid CPF or CNPJ"

@X
  normalize_email email
    >> validate_email_format
    >> check_duplicate email within customers
  ? doc_provided
    validate_doc doc
  <> stripe.customers.create
    send email name
    receive stripe_id
  persist customer
  emit customer.created
    ~> send_welcome_email
    ~> log_audit

@F
  on stripe_timeout
    retry 3 backoff exponential base 2s
  on stripe_error
    abort "Failed to create Stripe customer"
  on db_duplicate
    abort "Email already registered"

@V
  -- filled post-execution by the runtime
