-- Add loyalty permissions (loyalty.scan, loyalty.manage) to administrador and gerente.
-- loyalty.scan  = escanear tarjeta y sumar/canjear puntos
-- loyalty.manage = config del programa, ver tarjetas, ajustes, campañas
-- Idempotente. Nota: el módulo se activa por tenant con config.modules.loyalty;
-- tener el permiso no implica que el módulo esté activo.
UPDATE roles
SET permissions = permissions || '["loyalty.scan", "loyalty.manage"]'::jsonb
WHERE name IN ('administrador', 'gerente')
  AND NOT permissions @> '["loyalty.manage"]'::jsonb;
