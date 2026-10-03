-- Split payments: a sale can be paid with multiple methods.
CREATE TABLE IF NOT EXISTS "sale_payments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "sale_id" uuid NOT NULL REFERENCES "sales"("id") ON DELETE CASCADE,
  "method" "payment_method" NOT NULL,
  "amount" numeric(10, 2) NOT NULL
);
CREATE INDEX IF NOT EXISTS "sale_payments_sale_idx" ON "sale_payments" ("sale_id");

-- Backfill: every existing sale becomes a single payment for its full total
-- with its current method. Guarantees SUM(sale_payments.amount) = sales.total
-- per sale, so analytics that aggregate from sale_payments produce exactly the
-- same per-method numbers as before (no data loss, monthly close reconciles).
-- Idempotent: only inserts for sales that don't already have payments.
INSERT INTO "sale_payments" ("sale_id", "method", "amount")
SELECT s."id", s."payment_method", s."total"
FROM "sales" s
WHERE NOT EXISTS (
  SELECT 1 FROM "sale_payments" sp WHERE sp."sale_id" = s."id"
);
