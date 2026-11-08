-- Add max_scans_per_day to loyalty_programs: how many scans COUNT per business
-- day for anti-fraud. 1 = once/day (default, current behavior), 0 = unlimited,
-- >1 = N counted visits/day. Idempotent.
ALTER TABLE "loyalty_programs" ADD COLUMN IF NOT EXISTS "max_scans_per_day" integer NOT NULL DEFAULT 1;
