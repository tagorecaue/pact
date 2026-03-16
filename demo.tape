# Pact Demo GIF
Output demo.gif

Set Shell "bash"
Set FontSize 14
Set Width 920
Set Height 700
Set Theme "Catppuccin Mocha"
Set Padding 20
Set TypingSpeed 25ms

# Show the banner
Type "pact --help"
Enter
Sleep 4s

# Inspect a contract
Hide
Type "clear"
Enter
Sleep 500ms
Show
Type "pact inspect contracts/hello.pact"
Enter
Sleep 4s

# Run the contract successfully
Hide
Type "clear"
Enter
Sleep 500ms
Show
Type "pact run contracts/hello.pact --input '"
Type@0ms '{"name":"Tagore"}'
Type@0ms "'"
Enter
Sleep 4s

# Run with missing input (shows validation)
Hide
Type "clear"
Enter
Sleep 500ms
Show
Type "pact run contracts/hello.pact --input '{}'"
Enter
Sleep 3s

# List connectors
Hide
Type "clear"
Enter
Sleep 500ms
Show
Type "pact connectors"
Enter
Sleep 5s

# Show evidence trail
Hide
Type "clear"
Enter
Sleep 500ms
Show
Type "pact inspect --evidence contracts/hello.pact"
Enter
Sleep 5s
