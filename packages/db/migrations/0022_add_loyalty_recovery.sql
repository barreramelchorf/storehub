-- Loyalty: birth_date (for analytics) + recovery tokens (recover an existing
-- card when a returning user re-enrolls with an already-registered email).
-- Idempotent.

ALTER TABLE "loyalty_cards" ADD COLUMN IF NOT EXISTS "birth_date" date;

CREATE TABLE IF NOT EXISTS "loyalty_recovery_tokens" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "card_id" uuid NOT NULL REFERENCES "loyalty_cards"("id") ON DELETE CASCADE,
  "token" text NOT NULL UNIQUE,
  "expires_at" timestamp NOT NULL,
  "used_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "loyalty_recovery_tokens_token_idx" ON "loyalty_recovery_tokens" ("token");
CREATE INDEX IF NOT EXISTS "loyalty_recovery_tokens_card_idx" ON "loyalty_recovery_tokens" ("card_id");
