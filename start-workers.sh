#!/bin/bash

echo "🚀 Starting IntegraHub Workers"
echo ""

# Check if .env exists
if [ ! -f .env ]; then
  echo "⚠️  .env file not found, copying from .env.example"
  cp .env.example .env
fi

# Start orchestrator (manages chunker + multiple upsert workers)
echo "▶️  Starting worker orchestrator..."
npm run workers
