#!/bin/bash
# Migration script: Xalli (old) → StoreHub (new)
# Run from a machine with kubectl access to both namespaces

set -e

XALLI_NS="xalli-db"
STOREHUB_NS="storehub-data-prod"
TENANT_ID="7faa7c95-add1-4c2c-9fd0-5ed442856600"  # Xalli tenant in storehub

# Get passwords
XALLI_PW=$(kubectl exec -n $XALLI_NS xalli-postgresql-0 -- cat /opt/bitnami/postgresql/secrets/postgres-password)
STOREHUB_PW=$(kubectl get secret -n $STOREHUB_NS -o jsonpath='{.items[0].data.postgres-password}' | base64 -d 2>/dev/null || kubectl exec -n $STOREHUB_NS postgresql-0 -- cat /opt/bitnami/postgresql/secrets/postgres-password)

echo "=== Migrating Xalli → StoreHub ==="
echo "Tenant ID: $TENANT_ID"

# Export from Xalli
echo "--- Exporting from Xalli ---"
kubectl exec -n $XALLI_NS xalli-postgresql-0 -- sh -c "PGPASSWORD='$XALLI_PW' pg_dump -U postgres -d xalli --data-only --inserts -t categories -t products -t admin_users -t sales -t sale_items" > /tmp/xalli_dump.sql

echo "--- Transforming data ---"
# Create transformation SQL
cat > /tmp/migrate.sql << 'SQLEOF'
-- Migrate categories
INSERT INTO categories (id, tenant_id, name, description, active, sort_order)
SELECT gen_random_uuid(), '$TENANT_ID', name, description, is_active, id
FROM xalli_categories;

-- Migrate products  
INSERT INTO products (id, tenant_id, category_id, name, description, price, stock, min_stock, active, visible, created_at)
SELECT 
  gen_random_uuid(),
  '$TENANT_ID',
  (SELECT c.id FROM categories c WHERE c.tenant_id = '$TENANT_ID' AND c.sort_order = p.old_cat_id LIMIT 1),
  p.name, p.description, p.price, p.stock_quantity, 0, p.is_active, p.show_on_public_shop, p.created_at
FROM xalli_products p;

-- Migrate sales
INSERT INTO sales (id, tenant_id, user_id, total, discount, tip, payment_method, notes, status, sale_date, created_at)
SELECT
  gen_random_uuid(),
  '$TENANT_ID',
  (SELECT u.id FROM users u WHERE u.tenant_id = '$TENANT_ID' LIMIT 1),
  s.total_amount, s.discount_amount, s.tip_amount, s.payment_method, s.notes, 'approved', s.created_at, s.created_at
FROM xalli_sales s;
SQLEOF

echo "--- Running migration ---"
# Create temp tables in storehub, load xalli data, transform
kubectl exec -i -n $STOREHUB_NS postgresql-0 -- sh -c "PGPASSWORD='$STOREHUB_PW' psql -U postgres -d storehub" << SQLEOF

-- Create temp tables for xalli data
CREATE TEMP TABLE xalli_categories (id int, name varchar, description text, is_active boolean, created_at timestamp);
CREATE TEMP TABLE xalli_products (id int, name varchar, description text, price numeric, image_url varchar, category varchar, stock_quantity int, is_active boolean, show_on_public_shop boolean, created_at timestamp, updated_at timestamp);
CREATE TEMP TABLE xalli_users (id int, username varchar, email varchar, password_hash varchar, full_name varchar, role varchar, permissions text[], is_active boolean);
CREATE TEMP TABLE xalli_sales (id int, total_amount numeric, payment_method varchar, customer_name varchar, discount_amount numeric, tax_amount numeric, created_by int, created_at timestamp, notes text, tip_amount numeric);
CREATE TEMP TABLE xalli_sale_items (id int, sale_id int, product_id int, product_name varchar, quantity int, unit_price numeric, subtotal numeric);

-- Import raw data
$(kubectl exec -n $XALLI_NS xalli-postgresql-0 -- sh -c "PGPASSWORD='$XALLI_PW' psql -U postgres -d xalli -c \"COPY categories TO STDOUT WITH CSV HEADER\"" | sed 's/categories/xalli_categories/g')

\copy xalli_categories FROM STDIN WITH CSV HEADER;

-- Migrate categories
INSERT INTO categories (id, tenant_id, name, description, active, sort_order)
SELECT gen_random_uuid(), '$TENANT_ID', name, description, COALESCE(is_active, true), id
FROM xalli_categories
ON CONFLICT DO NOTHING;

-- Migrate products
INSERT INTO products (id, tenant_id, category_id, name, description, price, stock, min_stock, active, visible, created_at)
SELECT 
  gen_random_uuid(), '$TENANT_ID',
  (SELECT c.id FROM categories c WHERE c.tenant_id = '$TENANT_ID' ORDER BY c.sort_order LIMIT 1),
  p.name, p.description, p.price, COALESCE(p.stock_quantity, 0), 0, COALESCE(p.is_active, true), COALESCE(p.show_on_public_shop, true), COALESCE(p.created_at, NOW())
FROM xalli_products p
ON CONFLICT DO NOTHING;

SQLEOF

echo "=== Migration complete ==="
