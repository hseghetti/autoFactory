#!/usr/bin/env bash
set -euo pipefail

echo "=========================================================="
echo "AutoFactory Local Environment Setup (macOS / Linux)"
echo "=========================================================="

# 1. Check for Homebrew

if ! command -v brew &> /dev/null; then
    echo "Homebrew is required. Please install Homebrew first."
    exit 1
fi

# 2. Install Core System Dependencies

echo "--> Installing system binaries (git, jq, ollama, orbstack)..."
brew install git gh jq ollama orbstack || true

# 3. Check / Start OrbStack or Docker

if command -v orbstack &> /dev/null; then
    echo "--> Starting OrbStack..."
    orbstack start || true
fi

# 4. Install Global CLI Engines

echo "--> Installing CLI Execution Engines..."
npm install -g @anthropic-ai/claude-code
npm install -g opencode-ai

# 5. Start Ollama Service in Background

echo "--> Verifying Ollama service..."
if ! pgrep -x "ollama" > /dev/null; then
    ollama serve &
    sleep 3
fi

# 6. Pull Local AI Models for Hardware Execution (64GB RAM Optimized)

echo "--> Pulling Local Inference Models via Ollama..."

echo "   [1/3] Pulling Qwen 2.5 Coder 32B (Architecture & Inspection)..."
ollama pull qwen2.5-coder:32b

echo "   [2/3] Pulling Hermes 3 36B (Local Tool-Calling & Self-Healing)..."
ollama pull hermes3:36b

echo "   [3/3] Pulling DeepSeek-R1 14B (Reasoning & UX Briefs)..."
ollama pull deepseek-r1:14b

echo "=========================================================="
echo "Environment ready! Run 'npm install && npm run build' then"
echo "'npm run factory:start' to execute the graph."
echo "=========================================================="
