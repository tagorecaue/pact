pact v1

-- Connector: Notion API
@C connector.notion 1.0.0
  domain connectors.productivity
  author connector:community
  tags productivity notion workspace

@I
  natural "Connector for the Notion API"
  goal connector.operational

@S notion
  base_url "https://api.notion.com/v1"
  auth
    type bearer_token
    env NOTION_API_KEY
  rate_limit 3/sec
  retry_on 429 500 502 503

  operations
    create_page
      method POST
      path "/pages"
      intent "Create a new page in a Notion database or as a child page"
      input
        parent_id str !
        parent_type str =database_id
        title str !
        properties str ?
        content list ?
      output
        id str
        url str
        created_time str
      errors
        parent_not_found
          action abort "Parent page or database not found"
        validation_error
          action abort "Invalid page properties"

    query_database
      method POST
      path "/databases/{database_id}/query"
      intent "Query a Notion database with filters and sorts"
      input
        database_id str !
        filter str ?
        sorts list ?
        page_size int =100
      output
        results list
        has_more bool
        next_cursor str
      errors
        not_found
          action abort "Database not found"
        rate_limited
          action retry "Rate limit exceeded"

    update_page
      method PATCH
      path "/pages/{page_id}"
      intent "Update properties of an existing page"
      input
        page_id str !
        properties str !
        archived bool ?
      output
        id str
        last_edited_time str
      errors
        not_found
          action abort "Page not found"
        validation_error
          action abort "Invalid property values"
