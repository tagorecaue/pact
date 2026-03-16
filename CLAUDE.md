# CLAUDE.md - Pact

## Demo GIF

The `demo.gif` in the README is generated from `demo.tape` using [VHS](https://github.com/charmbracelet/vhs).

```bash
# Install VHS (requires Go and ttyd)
go install github.com/charmbracelet/vhs@latest
brew install ttyd  # or: sudo apt install ttyd

# Generate the GIF
vhs demo.tape
```

Edit `demo.tape` to change the demo flow (commands, timing, theme, dimensions). Run `vhs demo.tape` to regenerate `demo.gif`.
