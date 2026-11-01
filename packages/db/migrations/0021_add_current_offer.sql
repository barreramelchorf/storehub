-- Add current_offer to loyalty_cards. Persists the campaign offer message so the
-- device's pass pull (GET /v1/passes) renders it — without this, the offer only
-- existed in-memory during the campaign run, so the regenerated pass came back
-- "unchanged" and iOS showed no notification. Idempotent.
ALTER TABLE "loyalty_cards" ADD COLUMN IF NOT EXISTS "current_offer" text;
