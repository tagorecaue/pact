pact v1

-- Connector: GitLab API
@C connector.gitlab 1.0.0
  domain connectors.devtools
  author connector:community
  tags devtools gitlab vcs

@I
  natural "Connector for the GitLab REST API"
  goal connector.operational

@S gitlab
  base_url "https://gitlab.com/api/v4"
  auth
    type bearer_token
    env GITLAB_TOKEN
  rate_limit 2000/min
  retry_on 429 500 502 503

  operations
    create_issue
      method POST
      path "/projects/{project_id}/issues"
      intent "Create a new issue in a project"
      input
        project_id str !
        title str !
        description str ?
        labels str ?
        assignee_ids list ?
      output
        id int
        iid int
        web_url str
        state str
      errors
        not_found
          action abort "Project not found"
        forbidden
          action abort "Insufficient permissions"

    create_mr
      method POST
      path "/projects/{project_id}/merge_requests"
      intent "Create a merge request"
      input
        project_id str !
        title str !
        source_branch str !
        target_branch str =main
        description str ?
      output
        id int
        iid int
        web_url str
        state str
      errors
        not_found
          action abort "Project or branch not found"
        conflict
          action abort "Merge request already exists for this branch"

    get_pipeline
      method GET
      path "/projects/{project_id}/pipelines/{pipeline_id}"
      intent "Get pipeline status and details"
      input
        project_id str !
        pipeline_id int !
      output
        id int
        status str
        ref str
        web_url str
        created_at str
      errors
        not_found
          action abort "Pipeline not found"
