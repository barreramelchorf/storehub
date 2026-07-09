-- Rename English role names to Spanish
UPDATE roles SET name = 'cajero' WHERE name = 'cashier';
UPDATE roles SET name = 'gerente' WHERE name = 'manager';
UPDATE roles SET name = 'administrador' WHERE name = 'admin';
