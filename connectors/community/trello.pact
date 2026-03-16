pact v1

-- Connector: Trello project management
@C connector.trello 1.0.0
  domain connectors.productivity
  author connector:community
  tags productivity trello kanban

@I
  natural "Connector for the Trello API"
  goal connector.operational

@S trello
  base_url "https://api.trello.com/1"
  auth
    type api_key
    env TRELLO_API_KEY
  rate_limit 100/10sec
  retry_on 429 500 502 503

  operations
    create_card
      method POST
      path "/cards"
      intent "Create a new card on a Trello board"
      input
        name str !
        idList str !
        desc str ?
        pos str =bottom
        due str ?
        idLabels list ?
      output
        id str
        name str
        url str
        short_url str
      errors
        invalid_list
          action abort "List not found"
        forbidden
          action abort "No access to board"

    move_card
      method PUT
      path "/cards/{card_id}"
      intent "Move a card to a different list"
      input
        card_id str !
        idList str !
        pos str =bottom
      output
        id str
        idList str
        pos dec
      errors
        not_found
          action abort "Card not found"
        invalid_list
          action abort "Destination list not found"

    add_comment
      method POST
      path "/cards/{card_id}/actions/comments"
      intent "Add a comment to a Trello card"
      input
        card_id str !
        text str !
      output
        id str
        type str
        date str
      errors
        not_found
          action abort "Card not found"
        forbidden
          action abort "No permission to comment"
