pact v1

-- Connector: Supabase
@C connector.supabase 1.0.0
  domain connectors.storage
  author connector:community
  tags database storage supabase baas

@I
  natural "Connector for Supabase database and storage services"
  goal connector.operational

@S supabase
  base_url "https://{project_ref}.supabase.co"
  auth
    type api_key
    env SUPABASE_SERVICE_KEY
  rate_limit 1000/sec
  retry_on 429 500 502 503

  operations
    query
      method GET
      path "/rest/v1/{table}"
      intent "Query rows from a table with filters"
      input
        table str !
        select str =*
        filter str ?
        order str ?
        limit int =100
      output
        rows list
        count int
      errors
        table_not_found
          action abort "Table not found"
        invalid_filter
          action abort "Invalid filter syntax"

    insert
      method POST
      path "/rest/v1/{table}"
      intent "Insert one or more rows into a table"
      input
        table str !
        data str !
        on_conflict str ?
      output
        rows list
      errors
        unique_violation
          action abort "Duplicate key violation"
        not_null_violation
          action abort "Required field missing"

    update
      method PATCH
      path "/rest/v1/{table}"
      intent "Update rows matching a filter"
      input
        table str !
        filter str !
        data str !
      output
        rows list
      errors
        no_rows_matched
          action abort "No rows matched the filter"

    storage_upload
      method POST
      path "/storage/v1/object/{bucket}/{path}"
      intent "Upload a file to Supabase Storage"
      input
        bucket str !
        path str !
        file str !
        content_type str =application/octet-stream
      output
        key str
        id str
      errors
        bucket_not_found
          action abort "Storage bucket not found"
        file_too_large
          action abort "File exceeds size limit"
