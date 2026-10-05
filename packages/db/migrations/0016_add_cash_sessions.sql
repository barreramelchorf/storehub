-- Cash sessions (apertura/cierre de caja)
DO $$ BEGIN
  CREATE TYPE "cash_session_status" AS ENUM ('open', 'closed');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "cash_sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "status" "cash_session_status" NOT NULL DEFAULT 'open',
  "opened_by" uuid NOT NULL REFERENCES "users"("id"),
  "opened_at" timestamp NOT NULL DEFAULT now(),
  "opening_float" numeric(10, 2) NOT NULL,
  "closed_by" uuid REFERENCES "users"("id"),
  "closed_at" timestamp,
  "closing_count" numeric(10, 2),
  "expected_cash" numeric(10, 2),
  "difference" numeric(10, 2),
  "cash_sales" numeric(10, 2),
  "card_sales" numeric(10, 2),
  "transfer_sales" numeric(10, 2),
  "other_sales" numeric(10, 2),
  "business_date" text NOT NULL,
  "late_close" boolean NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS "cash_sessions_tenant_status_idx" ON "cash_sessions" ("tenant_id", "status");
CREATE INDEX IF NOT EXISTS "cash_sessions_tenant_date_idx" ON "cash_sessions" ("tenant_id", "business_date");

-- Link sales to a cash session (nullable: historical sales stay NULL, no backfill)
ALTER TABLE "sales" ADD COLUMN IF NOT EXISTS "cash_session_id" uuid REFERENCES "cash_sessions"("id");
