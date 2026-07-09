-- Add sales.delete to cajero_almacenista role (should have all permissions of cajero + almacenista)
UPDATE roles
SET permissions = permissions || '["sales.delete"]'::jsonb
WHERE name = 'cajero_almacenista'
  AND NOT permissions @> '["sales.delete"]'::jsonb;
