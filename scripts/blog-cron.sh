#!/bin/zsh
# Daily blog cron wrapper. Runs the Claude Code generator on the claude.ai
# subscription (no Anthropic API). Add to crontab, e.g. daily at 09:00:
#   0 9 * * * /Users/alexandrucojanu/facturamea/scripts/blog-cron.sh >> /Users/alexandrucojanu/facturamea/scripts/blog-cron.log 2>&1
# cron has a minimal environment, so set PATH explicitly (node + claude) and load
# the secret from a local, gitignored env file.

export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
cd "$(dirname "$0")/.." || exit 1

# Load CRON_SECRET (+ optional BLOG_BASE_URL / CLAUDE_BIN).
[ -f scripts/.blog-cron.env ] && source scripts/.blog-cron.env

# Force the CLI onto the claude.ai subscription, never the API key.
unset ANTHROPIC_API_KEY
unset ANTHROPIC_AUTH_TOKEN

node scripts/blog-claude-code.mjs
