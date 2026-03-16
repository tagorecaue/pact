pact v1

-- Connector: GitHub API
@C connector.github 1.0.0
  domain connectors.devtools
  author connector:community
  tags devtools github vcs

@I
  natural "Connector for the GitHub REST API"
  goal connector.operational

@S github
  base_url "https://api.github.com"
  auth
    type bearer_token
    env GITHUB_TOKEN
  rate_limit 5000/hour
  retry_on 429 500 502 503

  operations
    create_issue
      method POST
      path "/repos/{owner}/{repo}/issues"
      intent "Create a new issue in a repository"
      input
        owner str !
        repo str !
        title str !
        body str ?
        labels list ?
        assignees list ?
      output
        id int
        number int
        html_url str
        state str
      errors
        not_found
          action abort "Repository not found"
        validation_failed
          action abort "Invalid issue data"

    create_pr
      method POST
      path "/repos/{owner}/{repo}/pulls"
      intent "Create a pull request"
      input
        owner str !
        repo str !
        title str !
        body str ?
        head str !
        base str =main
      output
        id int
        number int
        html_url str
        state str
      errors
        not_found
          action abort "Repository or branch not found"
        unprocessable
          action abort "Invalid pull request data"

    get_repo
      method GET
      path "/repos/{owner}/{repo}"
      intent "Get repository information"
      input
        owner str !
        repo str !
      output
        id int
        full_name str
        description str
        default_branch str
        stargazers_count int
      errors
        not_found
          action abort "Repository not found"

    add_comment
      method POST
      path "/repos/{owner}/{repo}/issues/{issue_number}/comments"
      intent "Add a comment to an issue or pull request"
      input
        owner str !
        repo str !
        issue_number int !
        body str !
      output
        id int
        html_url str
        created_at str
      errors
        not_found
          action abort "Issue not found"

    create_webhook
      method POST
      path "/repos/{owner}/{repo}/hooks"
      intent "Create a repository webhook"
      input
        owner str !
        repo str !
        url str !
        content_type str =json
        events list =push
      output
        id int
        url str
        active bool
      errors
        not_found
          action abort "Repository not found"
        forbidden
          action abort "Insufficient permissions"
