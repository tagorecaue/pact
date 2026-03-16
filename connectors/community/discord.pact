pact v1

-- Connector: Discord API
@C connector.discord 1.0.0
  domain connectors.messaging
  author connector:community
  tags messaging discord bot

@I
  natural "Connector for the Discord API"
  goal connector.operational

@S discord
  base_url "https://discord.com/api/v10"
  auth
    type bearer_token
    env DISCORD_BOT_TOKEN
  rate_limit 50/sec
  retry_on 429 500 502 503

  operations
    send_message
      method POST
      path "/channels/{channel_id}/messages"
      intent "Send a message to a Discord channel"
      input
        channel_id str !
        content str !
        tts bool =false
        embeds list ?
      output
        id str
        channel_id str
        content str
        timestamp str
      errors
        unknown_channel
          action abort "Channel not found"
        missing_permissions
          action abort "Bot lacks permission to send messages"

    create_channel
      method POST
      path "/guilds/{guild_id}/channels"
      intent "Create a new channel in a Discord server"
      input
        guild_id str !
        name str !
        type int =0
        topic str ?
      output
        id str
        name str
        type int
      errors
        max_channels
          action abort "Server has reached channel limit"

    add_reaction
      method PUT
      path "/channels/{channel_id}/messages/{message_id}/reactions/{emoji}/@me"
      intent "Add a reaction emoji to a message"
      input
        channel_id str !
        message_id str !
        emoji str !
      output
        success bool
      errors
        unknown_message
          action abort "Message not found"
        unknown_emoji
          action abort "Unknown emoji"
