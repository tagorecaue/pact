pact v1

-- Connector: Redis key-value store
@C connector.redis 1.0.0
  domain connectors.database
  author connector:community
  tags database cache redis keyvalue

@I
  natural "Connector for Redis key-value data store"
  goal connector.operational

@S redis
  base_url "redis://localhost:6379"
  auth
    type connection_string
    env REDIS_URL
  retry_on 500

  operations
    get
      method GET
      path "/get"
      intent "Get the value of a key"
      input
        key str !
      output
        value str
        exists bool
      errors
        connection_error
          action retry "Redis connection failed"

    set
      method POST
      path "/set"
      intent "Set a key-value pair with optional expiration"
      input
        key str !
        value str !
        ex int ?
        px int ?
        nx bool ?
      output
        ok bool
      errors
        connection_error
          action retry "Redis connection failed"

    del
      method DELETE
      path "/del"
      intent "Delete one or more keys"
      input
        keys list !
      output
        deleted int
      errors
        connection_error
          action retry "Redis connection failed"

    hget
      method GET
      path "/hget"
      intent "Get a field value from a hash"
      input
        key str !
        field str !
      output
        value str
        exists bool
      errors
        wrong_type
          action abort "Key is not a hash"

    hset
      method POST
      path "/hset"
      intent "Set field-value pairs in a hash"
      input
        key str !
        field str !
        value str !
      output
        created int
      errors
        wrong_type
          action abort "Key is not a hash"

    lpush
      method POST
      path "/lpush"
      intent "Prepend values to a list"
      input
        key str !
        values list !
      output
        length int
      errors
        wrong_type
          action abort "Key is not a list"

    lrange
      method GET
      path "/lrange"
      intent "Get a range of elements from a list"
      input
        key str !
        start int =0
        stop int =-1
      output
        values list
      errors
        wrong_type
          action abort "Key is not a list"
