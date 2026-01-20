#!/bin/bash
set -e

# Create default config if none exists
if [ ! -f "$LITELLM_CONFIG_PATH" ]; then
  cat > "$LITELLM_CONFIG_PATH" << 'EOF'
model_list:
  - model_name: claude-sonnet
    litellm_params:
      model: anthropic/claude-sonnet-4-20250514
      api_key: os.environ/ANTHROPIC_API_KEY

  - model_name: claude-opus
    litellm_params:
      model: anthropic/claude-opus-4-20250514
      api_key: os.environ/ANTHROPIC_API_KEY

  - model_name: gpt-4o
    litellm_params:
      model: openai/gpt-4o
      api_key: os.environ/OPENAI_API_KEY

  - model_name: gpt-4o-mini
    litellm_params:
      model: openai/gpt-4o-mini
      api_key: os.environ/OPENAI_API_KEY

general_settings:
  master_key: ${LITELLM_MASTER_KEY:-}

litellm_settings:
  drop_params: true
  set_verbose: false
EOF
fi

# Start LiteLLM proxy
exec litellm --config "$LITELLM_CONFIG_PATH" --port 4000 --host 0.0.0.0
