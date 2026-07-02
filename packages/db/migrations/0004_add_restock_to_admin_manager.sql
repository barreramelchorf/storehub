-- Add inventory.restock permission to admin and manager roles that don't have it yet
UPDATE roles
SET permissions = permissions || '["inventory.restock"]'::jsonb
WHERE name IN ('admin', 'manager')
  AND NOT permissions @> '["inventory.restock"]'::jsonb;
