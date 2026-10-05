-- Add cash.view permission (see the Caja section: cash session history/reports)
-- to administrador and gerente roles. Idempotent.
UPDATE roles
SET permissions = permissions || '["cash.view"]'::jsonb
WHERE name IN ('administrador', 'gerente')
  AND NOT permissions @> '["cash.view"]'::jsonb;
