pact v1

-- Connector: Docker Engine API
@C connector.docker 1.0.0
  domain connectors.devtools
  author connector:community
  tags devtools docker containers

@I
  natural "Connector for the Docker Engine API"
  goal connector.operational

@S docker
  base_url "http://localhost:2375"
  auth
    type api_key
    env DOCKER_HOST
  retry_on 500 502 503

  operations
    list_containers
      method GET
      path "/v1.43/containers/json"
      intent "List all running containers"
      input
        all bool =false
        limit int ?
        filters str ?
      output
        containers list
      errors
        server_error
          action retry "Docker engine unavailable"

    create_container
      method POST
      path "/v1.43/containers/create"
      intent "Create a new container"
      input
        image str !
        name str ?
        cmd list ?
        env list ?
        exposed_ports str ?
      output
        id str
        warnings list
      errors
        image_not_found
          action abort "Image not found"
        conflict
          action abort "Container name already in use"

    start_container
      method POST
      path "/v1.43/containers/{container_id}/start"
      intent "Start a stopped container"
      input
        container_id str !
      output
        started bool
      errors
        not_found
          action abort "Container not found"
        already_started
          action abort "Container is already running"

    stop_container
      method POST
      path "/v1.43/containers/{container_id}/stop"
      intent "Stop a running container"
      input
        container_id str !
        timeout int =10
      output
        stopped bool
      errors
        not_found
          action abort "Container not found"
        already_stopped
          action abort "Container is not running"
