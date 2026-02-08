# LLM Router

Smart LLM router that uses local models by default and automatically escalates to powerful cloud models when needed.

**Save money on API costs** by routing simple requests to free local models (Ollama) and only using expensive cloud models (Claude Opus, GPT-4) for complex tasks.

## Features

- 🏠 **Local-first**: Uses Ollama by default for simple requests
- 🚀 **Auto-escalation**: Detects complex requests and routes to power models
- 🔌 **OpenAI-compatible API**: Drop-in replacement for `/v1/chat/completions`
- ⚡ **Fast classification**: <1ms routing decision, no LLM calls for classification
- 🔄 **Automatic fallback**: If local model fails, falls back to power model
- 📊 **Transparent**: Includes routing metadata in responses

## Quick Start

### Prerequisites

- Node.js 20+
- [Ollama](https://ollama.ai) running locally with a model (e.g., `qwen3:14b`)
- Anthropic API key (for power model)

### Installation

```bash
# Clone the repository
git clone https://github.com/manthis/llm-router.git
cd llm-router

# Install dependencies
pnpm install

# Copy and configure environment
cp .env.example .env
# Edit .env with your settings

# Start the server
pnpm dev
```

### Configuration

Create a `.env` file:

```bash
# Server
ROUTER_PORT=5555
ROUTER_HOST=127.0.0.1
ROUTER_DEBUG=false

# Default Model (local, free)
DEFAULT_PROVIDER=ollama
DEFAULT_MODEL=qwen3:14b
DEFAULT_BASE_URL=http://localhost:11434/v1

# Power Model (cloud, paid)
POWER_PROVIDER=anthropic
POWER_MODEL=claude-opus-4-5-20250205
POWER_BASE_URL=https://api.anthropic.com
POWER_API_KEY=sk-ant-...

# Classification Thresholds
THRESHOLD_MIN_LENGTH=500      # Message length to consider complex
THRESHOLD_MIN_CODE_LINES=30   # Code lines to trigger power model
THRESHOLD_MIN_SCORE=50        # Complexity score threshold (0-100)
```

### Using OpenClaw as Power Backend

If you're using [OpenClaw](https://github.com/openclaw/openclaw) with Claude Code OAuth, you can route power requests through OpenClaw instead of using a direct API key:

```bash
# Power via OpenClaw (uses existing OAuth session)
POWER_PROVIDER=openai
POWER_MODEL=anthropic/claude-opus-4-5
POWER_BASE_URL=https://hal9000.local:18789/v1
# No POWER_API_KEY needed - OpenClaw handles authentication
```

This is useful when:
- You use Claude Code OAuth instead of direct API keys
- You want to leverage OpenClaw's authentication and routing
- You want to consolidate API access through a single proxy

### Using with OpenClaw

Add the router as a provider in your OpenClaw config:

```json
{
  "models": {
    "providers": {
      "smart-router": {
        "baseUrl": "http://localhost:5555/v1",
        "api": "openai-completions",
        "models": [
          {
            "id": "router",
            "name": "Smart Router (auto)",
            "contextWindow": 32768,
            "maxTokens": 8192
          }
        ]
      }
    }
  },
  "agents": {
    "defaults": {
      "model": {
        "primary": "smart-router/router"
      }
    }
  }
}
```

## How It Works

### Classification Signals

The router analyzes each request for complexity signals:

| Signal | Score | Example |
|--------|-------|---------|
| Long message | 0-20 | >500 characters |
| Code blocks | 0-25 | >30 lines of code |
| Power keywords | 0-30 | "refactor", "architecture", "debug" |
| Multi-step reasoning | 15 | "First..., then..." |
| Debugging context | 10 | Error messages, stack traces |
| Programming languages | 0-5 | TypeScript, Python, etc. |
| Multiple questions | 0-10 | Several `?` marks |

If the total score is ≥ `THRESHOLD_MIN_SCORE` (default: 50), the request is routed to the power model.

### API Endpoints

#### POST /v1/chat/completions

OpenAI-compatible chat completions endpoint.

```bash
curl -X POST http://localhost:5555/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [{"role": "user", "content": "Hello!"}]
  }'
```

Response includes routing metadata:

```json
{
  "id": "chatcmpl-...",
  "choices": [...],
  "_router": {
    "tier": "default",
    "model": "qwen3:14b",
    "score": 12,
    "signals": ["simple_keywords:1"]
  }
}
```

#### GET /v1/router/info

Get current router configuration.

#### GET /v1/models

List available models (OpenAI-compatible).

#### GET /health

Health check endpoint.

## Development

```bash
# Run tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Run E2E tests (requires Ollama)
pnpm test:e2e

# Type check
pnpm typecheck

# Lint
pnpm lint

# Build
pnpm build
```

## License

MIT
