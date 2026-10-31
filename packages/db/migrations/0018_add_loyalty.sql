-- Loyalty (Apple/Google Wallet passes)
-- Módulo INDEPENDIENTE del POS. No depende de `sales`.
-- Gateado por config.modules.loyalty (default false). Idempotente.

-- Enums
DO $$ BEGIN
  CREATE TYPE "loyalty_platform" AS ENUM ('apple', 'google', 'unknown');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "loyalty_card_status" AS ENUM ('active', 'blocked');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "loyalty_tx_type" AS ENUM ('earn', 'redeem', 'adjust');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "loyalty_campaign_status" AS ENUM ('pending', 'sending', 'sent', 'failed');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Loyalty Programs (uno por tenant en v1)
CREATE TABLE IF NOT EXISTS "loyalty_programs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "active" boolean NOT NULL DEFAULT true,
  "points_per_visit" integer NOT NULL DEFAULT 1,
  "reward_threshold" integer,
  "reward_description" text,
  "branding" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "loyalty_programs_tenant_unique" UNIQUE ("tenant_id")
);
CREATE INDEX IF NOT EXISTS "loyalty_programs_tenant_idx" ON "loyalty_programs" ("tenant_id");

-- Loyalty Cards (una por cliente inscrito)
CREATE TABLE IF NOT EXISTS "loyalty_cards" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "program_id" uuid NOT NULL REFERENCES "loyalty_programs"("id") ON DELETE CASCADE,
  "customer_name" text NOT NULL,
  "customer_email" text,
  "customer_phone" text,
  "points" integer NOT NULL DEFAULT 0,
  "total_visits" integer NOT NULL DEFAULT 0,
  "serial_number" text NOT NULL UNIQUE,
  "auth_token" text NOT NULL,
  "platform" "loyalty_platform" NOT NULL DEFAULT 'unknown',
  "status" "loyalty_card_status" NOT NULL DEFAULT 'active',
  "last_scan_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "loyalty_cards_tenant_idx" ON "loyalty_cards" ("tenant_id");
CREATE INDEX IF NOT EXISTS "loyalty_cards_serial_idx" ON "loyalty_cards" ("serial_number");
CREATE INDEX IF NOT EXISTS "loyalty_cards_tenant_phone_idx" ON "loyalty_cards" ("tenant_id", "customer_phone");

-- Loyalty Transactions (log de movimientos de puntos, auditoría)
CREATE TABLE IF NOT EXISTS "loyalty_transactions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "card_id" uuid NOT NULL REFERENCES "loyalty_cards"("id") ON DELETE CASCADE,
  "type" "loyalty_tx_type" NOT NULL,
  "points" integer NOT NULL,
  "balance_after" integer NOT NULL,
  "performed_by" uuid REFERENCES "users"("id"),
  "note" text,
  "created_at" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "loyalty_transactions_card_idx" ON "loyalty_transactions" ("card_id");
CREATE INDEX IF NOT EXISTS "loyalty_transactions_tenant_idx" ON "loyalty_transactions" ("tenant_id");

-- Apple Pass Registrations (dispositivos para push; requerido por el web service de Apple)
CREATE TABLE IF NOT EXISTS "apple_pass_registrations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "card_id" uuid NOT NULL REFERENCES "loyalty_cards"("id") ON DELETE CASCADE,
  "device_library_id" text NOT NULL,
  "push_token" text NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "apple_pass_registrations_unique" UNIQUE ("card_id", "device_library_id")
);
CREATE INDEX IF NOT EXISTS "apple_pass_registrations_card_idx" ON "apple_pass_registrations" ("card_id");

-- Loyalty Campaigns (campañas de oferta -> actualizan el campo "Oferta" del pase)
CREATE TABLE IF NOT EXISTS "loyalty_campaigns" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "program_id" uuid NOT NULL REFERENCES "loyalty_programs"("id") ON DELETE CASCADE,
  "message" text NOT NULL,
  "expires_at" timestamp,
  "status" "loyalty_campaign_status" NOT NULL DEFAULT 'pending',
  "target_count" integer NOT NULL DEFAULT 0,
  "sent_count" integer NOT NULL DEFAULT 0,
  "created_by" uuid NOT NULL REFERENCES "users"("id"),
  "created_at" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "loyalty_campaigns_tenant_status_idx" ON "loyalty_campaigns" ("tenant_id", "status");
