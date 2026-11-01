-- Add welcome_points to loyalty_programs: points granted once at enrollment
-- (default 1 = card starts with the first visit; set 0 to start empty).
-- Idempotent.
ALTER TABLE "loyalty_programs" ADD COLUMN IF NOT EXISTS "welcome_points" integer NOT NULL DEFAULT 1;
