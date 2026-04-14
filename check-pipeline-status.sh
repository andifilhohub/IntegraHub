#!/bin/bash

echo "📊 IntegraHub Pipeline Status Report"
echo "====================================="
echo ""

DB_HOST="${DB_HOST:-127.0.0.1}"
DB_USER="${DB_USER:-integrahub_user}"
DB_NAME="${DB_NAME:-integrahub_db}"
DB_PASSWORD="${DB_PASSWORD:-kdnfpsjf_sf098ew2}"

# Products count
echo "🗄️  Products in Database:"
PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -P pager=off -t -c \
  "SELECT COUNT(*) FROM \"Product\";" | xargs echo "  Total:"

echo ""

# Recent batches
echo "📦 Recent Batches:"
PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -P pager=off -c \
  "SELECT 
    LEFT(batch_id::text, 8) as batch,
    status, 
    items_total as total,
    items_processed as processed,
    items_failed as failed,
    TO_CHAR(created_at, 'HH24:MI:SS') as time
   FROM batches 
   ORDER BY created_at DESC 
   LIMIT 5;"

echo ""

# Chunks status
echo "🧩 Chunks Status:"
PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -P pager=off -c \
  "SELECT 
    status,
    COUNT(*) as count,
    SUM(items_count) as total_items
   FROM batch_chunks
   GROUP BY status;"

echo ""

# Recent failures with root cause
echo "🚨 Recent Failures (with error):"
PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -P pager=off -c \
  "SELECT
    LEFT(batch_id::text, 8) as batch,
    status,
    items_total as total,
    items_processed as processed,
    items_failed as failed,
    LEFT(COALESCE(error_code, '-'), 20) as code,
    LEFT(COALESCE(error_message, '-'), 120) as error,
    TO_CHAR(last_error_at, 'MM-DD HH24:MI:SS') as last_error
   FROM batches
   WHERE status IN ('FAILED', 'PARTIAL_FAIL')
   ORDER BY COALESCE(last_error_at, created_at) DESC
   LIMIT 10;"

echo ""

# Failed chunks with root cause
echo "🧩 Failed Chunks (with error):"
PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -P pager=off -c \
  "SELECT
    LEFT(chunk_id::text, 8) as chunk,
    LEFT(batch_id::text, 8) as batch,
    chunk_index,
    attempts,
    items_count,
    LEFT(COALESCE(error_code, '-'), 20) as code,
    LEFT(COALESCE(error_message, '-'), 120) as error,
    TO_CHAR(last_error_at, 'MM-DD HH24:MI:SS') as last_error
   FROM batch_chunks
   WHERE status = 'FAILED'
   ORDER BY COALESCE(last_error_at, updated_at) DESC
   LIMIT 10;"

echo ""
echo "✅ Pipeline test completed!"
