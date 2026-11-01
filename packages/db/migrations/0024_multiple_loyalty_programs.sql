-- Multiple loyalty programs per tenant (add-on). Drop the one-program-per-tenant
-- unique constraint, and index cards by (program, email) for per-program
-- duplicate detection (a customer can enroll once per program, not per tenant).
-- Idempotent.
ALTER TABLE "loyalty_programs" DROP CONSTRAINT IF EXISTS "loyalty_programs_tenant_unique";
CREATE INDEX IF NOT EXISTS "loyalty_cards_program_email_idx" ON "loyalty_cards" ("program_id", "customer_email");
