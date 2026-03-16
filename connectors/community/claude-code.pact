pact v1

-- Connector: Claude Code CLI
@C connector.claude-code 1.0.0
  domain connectors.custom
  author connector:community
  tags cli ai coding assistant

@I
  natural "Connector for Claude Code CLI shell commands"
  goal connector.operational

@S claude-code
  base_url "local://shell"
  auth
    type api_key
    env ANTHROPIC_API_KEY
  primitive shell

  operations
    execute
      method POST
      path "/execute"
      intent "Execute a command via the shell primitive and return output"
      input
        command str !
        cwd str ?
        timeout int =30000
      output
        stdout str
        stderr str
        exit_code int
      errors
        command_failed
          action abort "Command exited with non-zero status"
        timeout
          action abort "Command exceeded timeout"
        dangerous_command
          action abort "Command refused for safety"

    analyze
      method POST
      path "/analyze"
      intent "Analyze a file or directory using Claude Code"
      input
        path str !
        query str !
        timeout int =60000
      output
        stdout str
        stderr str
        exit_code int
      errors
        not_found
          action abort "Path not found"
        timeout
          action abort "Analysis exceeded timeout"

    generate
      method POST
      path "/generate"
      intent "Generate code using Claude Code CLI"
      input
        prompt str !
        output_dir str ?
        timeout int =120000
      output
        stdout str
        stderr str
        exit_code int
      errors
        generation_failed
          action abort "Code generation failed"
        timeout
          action abort "Generation exceeded timeout"
