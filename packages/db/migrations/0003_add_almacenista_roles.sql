-- Add almacenista and cajero_almacenista roles to all existing tenants that don't have them yet
INSERT INTO roles (id, tenant_id, name, permissions, is_default)
SELECT gen_random_uuid(), t.id, 'almacenista', '["inventory.view", "inventory.restock"]'::jsonb, true
FROM tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM roles r WHERE r.tenant_id = t.id AND r.name = 'almacenista'
);

INSERT INTO roles (id, tenant_id, name, permissions, is_default)
SELECT gen_random_uuid(), t.id, 'cajero_almacenista', '["sales.create", "inventory.view", "inventory.restock"]'::jsonb, true
FROM tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM roles r WHERE r.tenant_id = t.id AND r.name = 'cajero_almacenista'
);
