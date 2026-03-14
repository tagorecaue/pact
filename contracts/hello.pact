pact v1

-- A simple contract that validates input, persists data, and emits an event
@C hello.world 1.0.0
  domain demo
  author pact:cli
  created 2026-03-14T00:00:00Z
  tags demo hello

@I
  natural "Greet a user by name and persist the greeting"
  goal greeting.persisted & greeting.emitted
  accept
    "User is greeted with their name"
    "Greeting is persisted"
    "greeting.created event is emitted"
  reject
    "Greet without a name"
  priority normal
  timeout 5s

@E
  greeting
    id id ~
    name str !
    message str ~
    created_at ts ~

@K
  name min 1
    severity fatal
    message "Name is required"

@X
  validate name
  generate_id
  set message "Hello, {name}!"
  persist greeting
  emit greeting.created
