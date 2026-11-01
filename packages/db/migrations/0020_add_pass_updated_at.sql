-- Add pass_updated_at to loyalty_cards. Advances on ANY pass-visible change
-- (scan, redeem, adjust, campaign) so the Apple web service `lastUpdated` tag
-- reliably signals updates to iOS. Previously we (incorrectly) used last_scan_at,
-- which campaigns/adjusts don't touch — so iOS ignored those updates.
-- Idempotent. Existing rows get now() as a sane baseline.
ALTER TABLE "loyalty_cards" ADD COLUMN IF NOT EXISTS "pass_updated_at" timestamp NOT NULL DEFAULT now();
