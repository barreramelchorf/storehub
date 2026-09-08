-- Campaign type enum
DO $$ BEGIN
  CREATE TYPE "campaign_type" AS ENUM ('nxm', 'percentage');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Campaigns
CREATE TABLE IF NOT EXISTS "campaigns" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "type" "campaign_type" NOT NULL,
  "config" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "days_of_week" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "active" boolean NOT NULL DEFAULT true,
  "priority" integer NOT NULL DEFAULT 0,
  "created_at" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "campaigns_tenant_idx" ON "campaigns" ("tenant_id");

-- Campaign ↔ Product
CREATE TABLE IF NOT EXISTS "campaign_products" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "campaign_id" uuid NOT NULL REFERENCES "campaigns"("id") ON DELETE CASCADE,
  "product_id" uuid NOT NULL REFERENCES "products"("id") ON DELETE CASCADE,
  CONSTRAINT "campaign_products_unique" UNIQUE ("campaign_id", "product_id")
);
CREATE INDEX IF NOT EXISTS "campaign_products_campaign_idx" ON "campaign_products" ("campaign_id");

-- Campaign ↔ Category
CREATE TABLE IF NOT EXISTS "campaign_categories" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "campaign_id" uuid NOT NULL REFERENCES "campaigns"("id") ON DELETE CASCADE,
  "category_id" uuid NOT NULL REFERENCES "categories"("id") ON DELETE CASCADE,
  CONSTRAINT "campaign_categories_unique" UNIQUE ("campaign_id", "category_id")
);
CREATE INDEX IF NOT EXISTS "campaign_categories_campaign_idx" ON "campaign_categories" ("campaign_id");
