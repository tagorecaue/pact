pact v1

-- Connector: Vercel deployment platform
@C connector.vercel 1.0.0
  domain connectors.devtools
  author connector:community
  tags devtools vercel deployment hosting

@I
  natural "Connector for the Vercel deployment platform API"
  goal connector.operational

@S vercel
  base_url "https://api.vercel.com"
  auth
    type bearer_token
    env VERCEL_TOKEN
  rate_limit 100/min
  retry_on 429 500 502 503

  operations
    create_deployment
      method POST
      path "/v13/deployments"
      intent "Create a new deployment"
      input
        name str !
        project str ?
        target str =production
        git_source str ?
      output
        id str
        url str
        state str
        created_at int
      errors
        invalid_config
          action abort "Invalid deployment configuration"
        rate_limited
          action retry "Rate limit exceeded"

    get_domains
      method GET
      path "/v5/domains"
      intent "List all domains in the account"
      input
        limit int =20
      output
        domains list
        pagination str
      errors
        forbidden
          action abort "Insufficient permissions"

    get_project
      method GET
      path "/v9/projects/{project_id}"
      intent "Get project details"
      input
        project_id str !
      output
        id str
        name str
        framework str
        latest_deployments list
      errors
        not_found
          action abort "Project not found"
