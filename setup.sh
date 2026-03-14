#!/usr/bin/env bash
set -euo pipefail

# ─── Pact Setup ───
# Installs everything needed to run Pact:
#   1. Bun (TypeScript runtime)
#   2. llama.cpp (LLM inference engine)
#   3. Qwen 3.5 model (GGUF quantized)
#   4. Pact dependencies
#
# Usage:
#   ./setup.sh                  # Install with default model (0.8B)
#   ./setup.sh --model tiny     # Qwen 3.5 0.8B  (~560 MB, ~2-3 GB RAM)
#   ./setup.sh --model small    # Qwen 3.5 2B    (~1.5 GB, ~4-5 GB RAM)
#   ./setup.sh --model medium   # Qwen 3.5 4B    (~2.7 GB, ~6-7 GB RAM)
#   ./setup.sh --model large    # Qwen 3.5 9B    (~5.5 GB, ~8-10 GB RAM)
#   ./setup.sh --skip-llm       # Skip llama.cpp and model download
#   ./setup.sh --help           # Show this help

PACT_DIR="$(cd "$(dirname "$0")" && pwd)"
VENDOR_DIR="$PACT_DIR/vendor"
LLAMA_DIR="$VENDOR_DIR/llama.cpp"
MODELS_DIR="$PACT_DIR/models"

MODEL_SIZE="tiny"
SKIP_LLM=false

# ─── Model definitions ───

declare -A MODEL_REPO=(
  [tiny]="bartowski/Qwen_Qwen3.5-0.8B-GGUF"
  [small]="bartowski/Qwen_Qwen3.5-2B-GGUF"
  [medium]="bartowski/Qwen_Qwen3.5-4B-GGUF"
  [large]="bartowski/Qwen_Qwen3.5-9B-GGUF"
)

declare -A MODEL_FILE=(
  [tiny]="Qwen_Qwen3.5-0.8B-Q4_K_M.gguf"
  [small]="Qwen_Qwen3.5-2B-Q4_K_M.gguf"
  [medium]="Qwen_Qwen3.5-4B-Q4_K_M.gguf"
  [large]="Qwen_Qwen3.5-9B-Q4_K_M.gguf"
)

declare -A MODEL_DESC=(
  [tiny]="Qwen 3.5 0.8B Q4_K_M (~560 MB, needs ~2-3 GB RAM)"
  [small]="Qwen 3.5 2B Q4_K_M (~1.5 GB, needs ~4-5 GB RAM)"
  [medium]="Qwen 3.5 4B Q4_K_M (~2.7 GB, needs ~6-7 GB RAM)"
  [large]="Qwen 3.5 9B Q4_K_M (~5.5 GB, needs ~8-10 GB RAM)"
)

# ─── Parse arguments ───

show_help() {
  echo "Pact Setup"
  echo ""
  echo "Usage: ./setup.sh [OPTIONS]"
  echo ""
  echo "Options:"
  echo "  --model <size>   Model size to download (default: tiny)"
  echo "                   tiny   = Qwen 3.5 0.8B  (~560 MB download, ~2-3 GB RAM)"
  echo "                   small  = Qwen 3.5 2B    (~1.5 GB download, ~4-5 GB RAM)"
  echo "                   medium = Qwen 3.5 4B    (~2.7 GB download, ~6-7 GB RAM)"
  echo "                   large  = Qwen 3.5 9B    (~5.5 GB download, ~8-10 GB RAM)"
  echo "  --skip-llm       Skip llama.cpp compilation and model download"
  echo "  --help            Show this help"
  echo ""
  echo "Examples:"
  echo "  ./setup.sh                     # Quick start with smallest model"
  echo "  ./setup.sh --model medium      # Better code generation quality"
  echo "  ./setup.sh --skip-llm          # Parser/runtime only, no LLM"
  exit 0
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --model)
      MODEL_SIZE="$2"
      if [[ -z "${MODEL_REPO[$MODEL_SIZE]+_}" ]]; then
        echo "Error: unknown model size '$MODEL_SIZE'. Use: tiny, small, medium, large"
        exit 1
      fi
      shift 2
      ;;
    --skip-llm)
      SKIP_LLM=true
      shift
      ;;
    --help|-h)
      show_help
      ;;
    *)
      echo "Unknown option: $1"
      echo "Run './setup.sh --help' for usage."
      exit 1
      ;;
  esac
done

# ─── Helpers ───

log()  { echo -e "\n\033[1;32m[pact]\033[0m $1"; }
warn() { echo -e "\033[1;33m[warn]\033[0m $1"; }
fail() { echo -e "\033[1;31m[fail]\033[0m $1"; exit 1; }

check_command() {
  if ! command -v "$1" &>/dev/null; then
    fail "'$1' is required but not installed."
  fi
}

# ─── Step 1: Prerequisites ───

log "Checking prerequisites..."

check_command "git"
check_command "make"
check_command "curl"

# Check for C compiler
if command -v gcc &>/dev/null; then
  CC_INFO="$(gcc --version | head -1)"
elif command -v cc &>/dev/null; then
  CC_INFO="$(cc --version | head -1)"
else
  fail "A C compiler (gcc or cc) is required to build llama.cpp."
fi

echo "  git:      $(git --version)"
echo "  make:     $(make --version | head -1)"
echo "  compiler: $CC_INFO"

# ─── Step 2: Install Bun ───

if command -v bun &>/dev/null; then
  log "Bun already installed: $(bun --version)"
else
  log "Installing Bun..."
  curl -fsSL https://bun.sh/install | bash
  export BUN_INSTALL="$HOME/.bun"
  export PATH="$BUN_INSTALL/bin:$PATH"
  log "Bun installed: $(bun --version)"
fi

# Ensure bun is in PATH for this session
export PATH="$HOME/.bun/bin:$PATH"

# ─── Step 3: Install Pact dependencies ───

log "Installing Pact dependencies..."
cd "$PACT_DIR"
bun install

# ─── Step 3b: Install pact CLI command ───

log "Installing 'pact' command..."
cat > "$HOME/.bun/bin/pact" << PACTCLI
#!/usr/bin/env bash
exec "\$HOME/.bun/bin/bun" "$PACT_DIR/src/cli.ts" "\$@"
PACTCLI
chmod +x "$HOME/.bun/bin/pact"
log "'pact' command installed. Run 'pact --help' to verify."

# ─── Step 4: Run parser tests ───

log "Running parser tests..."
if bun test 2>&1 | tail -3; then
  log "Parser tests passed."
else
  warn "Some tests failed. Pact parser may not work correctly."
fi

# ─── Step 5: llama.cpp ───

if [ "$SKIP_LLM" = true ]; then
  log "Skipping LLM setup (--skip-llm)."
else
  mkdir -p "$VENDOR_DIR"
  mkdir -p "$MODELS_DIR"

  if [ -f "$LLAMA_DIR/llama-cli" ]; then
    log "llama.cpp already compiled."
  else
    log "Cloning and compiling llama.cpp..."
    if [ -d "$LLAMA_DIR" ]; then
      cd "$LLAMA_DIR" && git pull
    else
      git clone https://github.com/ggerganov/llama.cpp "$LLAMA_DIR"
    fi
    cd "$LLAMA_DIR"
    make -j"$(nproc)" 2>&1 | tail -5
    if [ -f "$LLAMA_DIR/llama-cli" ]; then
      log "llama.cpp compiled successfully."
    else
      # Newer versions use build/ directory
      if [ -f "$LLAMA_DIR/build/bin/llama-cli" ]; then
        log "llama.cpp compiled successfully (build/bin/)."
      else
        warn "llama-cli not found after compilation. Trying cmake build..."
        mkdir -p "$LLAMA_DIR/build" && cd "$LLAMA_DIR/build"
        cmake .. -DCMAKE_BUILD_TYPE=Release 2>&1 | tail -3
        cmake --build . --config Release -j"$(nproc)" 2>&1 | tail -5
        log "llama.cpp cmake build complete."
      fi
    fi
  fi

  # ─── Step 6: Download model ───

  MODEL_PATH="$MODELS_DIR/${MODEL_FILE[$MODEL_SIZE]}"

  if [ -f "$MODEL_PATH" ]; then
    log "Model already downloaded: ${MODEL_FILE[$MODEL_SIZE]}"
  else
    log "Downloading ${MODEL_DESC[$MODEL_SIZE]}..."
    echo "  This may take a few minutes depending on your connection."

    # Use huggingface-cli if available, otherwise curl
    if command -v huggingface-cli &>/dev/null; then
      huggingface-cli download "${MODEL_REPO[$MODEL_SIZE]}" \
        --include "${MODEL_FILE[$MODEL_SIZE]}" \
        --local-dir "$MODELS_DIR"
    else
      # Direct download via curl
      HF_URL="https://huggingface.co/${MODEL_REPO[$MODEL_SIZE]}/resolve/main/${MODEL_FILE[$MODEL_SIZE]}"
      curl -L --progress-bar -o "$MODEL_PATH" "$HF_URL"
    fi

    if [ -f "$MODEL_PATH" ]; then
      FILE_SIZE=$(du -h "$MODEL_PATH" | cut -f1)
      log "Model downloaded: ${MODEL_FILE[$MODEL_SIZE]} ($FILE_SIZE)"
    else
      fail "Model download failed."
    fi
  fi

  # ─── Step 7: Verify LLM works ───

  log "Verifying LLM inference..."

  # Find llama-cli binary
  LLAMA_BIN=""
  for candidate in \
    "$LLAMA_DIR/llama-cli" \
    "$LLAMA_DIR/build/bin/llama-cli" \
    "$LLAMA_DIR/main"; do
    if [ -f "$candidate" ]; then
      LLAMA_BIN="$candidate"
      break
    fi
  done

  if [ -z "$LLAMA_BIN" ]; then
    warn "Could not find llama-cli binary. LLM verification skipped."
  else
    echo "  Binary: $LLAMA_BIN"
    echo "  Model:  $MODEL_PATH"
    echo ""

    RESPONSE=$("$LLAMA_BIN" \
      -m "$MODEL_PATH" \
      -p "What is 2+2? Answer with just the number:" \
      -n 10 \
      --no-display-prompt \
      2>/dev/null | head -1)

    if echo "$RESPONSE" | grep -q "4"; then
      log "LLM verification passed. Response: $RESPONSE"
    else
      warn "LLM responded but answer was unexpected: $RESPONSE"
      warn "The model is working but may need prompt tuning."
    fi
  fi
fi

# ─── Step 8: Write config ───

log "Writing Pact configuration..."

cat > "$PACT_DIR/pact.config.json" <<CONF
{
  "version": "0.1.0",
  "llm": {
    "binary": "$([ "$SKIP_LLM" = false ] && echo "$LLAMA_BIN" || echo "")",
    "model": "$([ "$SKIP_LLM" = false ] && echo "$MODEL_PATH" || echo "")",
    "model_size": "$MODEL_SIZE",
    "context_length": 4096,
    "temperature": 0.6,
    "top_p": 0.95,
    "timeout_seconds": 30
  },
  "data_dir": "data",
  "contracts_dir": "contracts"
}
CONF

log "Config saved to pact.config.json"

# ─── Done ───

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
log "Pact setup complete!"
echo ""
echo "  Parser:    bun test"
echo "  Parse:     bun run src/index.ts tests/fixtures/simple.pact"
if [ "$SKIP_LLM" = false ]; then
echo "  LLM:       $MODEL_SIZE (${MODEL_FILE[$MODEL_SIZE]})"
fi
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
