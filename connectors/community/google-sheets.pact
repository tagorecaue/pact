pact v1

-- Connector: Google Sheets API
@C connector.google-sheets 1.0.0
  domain connectors.productivity
  author connector:community
  tags productivity google sheets spreadsheet

@I
  natural "Connector for the Google Sheets API"
  goal connector.operational

@S google-sheets
  base_url "https://sheets.googleapis.com/v4"
  auth
    type bearer_token
    env GOOGLE_SHEETS_API_KEY
  rate_limit 60/min
  retry_on 429 500 502 503

  operations
    read_range
      method GET
      path "/spreadsheets/{spreadsheet_id}/values/{range}"
      intent "Read values from a range of cells"
      input
        spreadsheet_id str !
        range str !
        value_render_option str =FORMATTED_VALUE
      output
        range str
        major_dimension str
        values list
      errors
        not_found
          action abort "Spreadsheet not found"
        invalid_range
          action abort "Invalid cell range"

    write_range
      method PUT
      path "/spreadsheets/{spreadsheet_id}/values/{range}"
      intent "Write values to a range of cells"
      input
        spreadsheet_id str !
        range str !
        values list !
        value_input_option str =USER_ENTERED
      output
        updated_range str
        updated_rows int
        updated_columns int
        updated_cells int
      errors
        not_found
          action abort "Spreadsheet not found"
        forbidden
          action abort "No write permission"

    append_row
      method POST
      path "/spreadsheets/{spreadsheet_id}/values/{range}:append"
      intent "Append a row of data to the end of a sheet"
      input
        spreadsheet_id str !
        range str !
        values list !
        value_input_option str =USER_ENTERED
      output
        updated_range str
        updated_rows int
      errors
        not_found
          action abort "Spreadsheet not found"
        forbidden
          action abort "No write permission"
