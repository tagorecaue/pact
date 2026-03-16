pact v1

-- Connector: Datadog monitoring
@C connector.datadog 1.0.0
  domain connectors.monitoring
  author connector:community
  tags monitoring metrics datadog observability

@I
  natural "Connector for the Datadog monitoring and metrics API"
  goal connector.operational

@S datadog
  base_url "https://api.datadoghq.com/api"
  auth
    type api_key
    env DATADOG_API_KEY
  rate_limit 120/min
  retry_on 429 500 502 503

  operations
    send_metric
      method POST
      path "/v2/series"
      intent "Submit custom metrics to Datadog"
      input
        metric str !
        type str =gauge
        points list !
        tags list ?
        unit str ?
      output
        status str
        errors list
      errors
        invalid_metric
          action abort "Invalid metric name or data"
        rate_limited
          action retry "Rate limit exceeded"

    create_event
      method POST
      path "/v1/events"
      intent "Post an event to the Datadog event stream"
      input
        title str !
        text str !
        alert_type str =info
        tags list ?
        priority str =normal
      output
        event_id int
        status str
      errors
        invalid_event
          action abort "Invalid event data"

    query_metrics
      method GET
      path "/v1/query"
      intent "Query timeseries metric data"
      input
        query str !
        from int !
        to int !
      output
        status str
        series list
        from_date int
        to_date int
      errors
        invalid_query
          action abort "Invalid metric query"
        rate_limited
          action retry "Rate limit exceeded"
