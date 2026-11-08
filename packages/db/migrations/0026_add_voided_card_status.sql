-- Add 'voided' to loyalty_card_status enum (soft-delete / anular tarjeta).
-- A voided card is invalidated on the customer's device (Apple voided:true,
-- Google EXPIRED), can't be scanned, and is kept for traceability until a
-- future purge cronjob removes it. Idempotent (skip if the value already exists).
-- Postgres 16 allows ADD VALUE inside a transaction; the new value is only used
-- by later migrations/runtime, never in this same statement.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'loyalty_card_status' AND e.enumlabel = 'voided'
  ) THEN
    ALTER TYPE "loyalty_card_status" ADD VALUE 'voided';
  END IF;
END $$;
