-- Create 'tienda_online' system user for each tenant (for online sales attribution)
INSERT INTO users (id, tenant_id, email, username, password_hash, role_id, active, must_change_password)
SELECT
  gen_random_uuid(),
  t.id,
  'online@' || t.slug || '.storehub',
  'tienda_online',
  'SYSTEM_USER_NO_LOGIN',
  (SELECT id FROM roles WHERE tenant_id = t.id LIMIT 1),
  false,
  false
FROM tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM users u WHERE u.tenant_id = t.id AND u.username = 'tienda_online'
);
