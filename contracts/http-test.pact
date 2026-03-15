pact v1

@C http.test 1.0.0
  domain demo
  author pact:cli
  created 2026-03-14T00:00:00Z
  tags demo http

@T
  http GET /api/http-test

@I
  natural "Test outbound HTTP by fetching a public API"
  goal response.received
  timeout 30s

@E
  result
    id id ~
    source str !
    data str ?

@X
  <> httpbin.org/post
    send source
    receive url origin
