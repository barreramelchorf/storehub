-- Add cancelled and pending_delete to sale_status enum
ALTER TYPE sale_status ADD VALUE IF NOT EXISTS 'cancelled';
ALTER TYPE sale_status ADD VALUE IF NOT EXISTS 'pending_delete';

-- Add sales.delete permission to admin and manager roles
UPDATE roles
SET permissions = permissions || '["sales.delete"]'::jsonb
WHERE name IN ('admin', 'manager')
  AND NOT permissions @> '["sales.delete"]'::jsonb;

-- Add sales.delete to cashier roles too (they will go through approval flow)
UPDATE roles
SET permissions = permissions || '["sales.delete"]'::jsonb
WHERE name = 'cashier'
  AND NOT permissions @> '["sales.delete"]'::jsonb;
