pact v1

-- Connector: PostgreSQL database
@C connector.postgresql 1.0.0
  domain connectors.database
  author connector:community
  tags database sql relational postgresql

@I
  natural "Connector for PostgreSQL relational databases"
  goal connector.operational

@S postgresql
  base_url "postgresql://localhost:5432"
  auth
    type connection_string
    env DATABASE_URL
  primitive sql

  operations
    query
      method GET
      path "/query"
      intent "Execute a read-only SQL query"
      input
        sql str !
        params list ?
        timeout int =30000
      output
        rows list
        row_count int
      errors
        syntax_error
          action abort "SQL syntax error"
        relation_not_found
          action abort "Table or view not found"
        timeout
          action retry "Query exceeded timeout"

    execute
      method POST
      path "/execute"
      intent "Execute a write SQL command"
      input
        sql str !
        params list ?
        timeout int =30000
      output
        affected_rows int
      errors
        unique_violation
          action abort "Duplicate record"
        foreign_key_violation
          action abort "Invalid reference"
        not_null_violation
          action abort "Required field missing"

    transaction
      method POST
      path "/transaction"
      intent "Execute multiple commands in an atomic transaction"
      input
        steps list !
        isolation str =read_committed
        timeout int =60000
      output
        results list
        committed bool
      errors
        serialization_failure
          action retry "Serialization conflict"
        deadlock
          action retry "Deadlock detected"
