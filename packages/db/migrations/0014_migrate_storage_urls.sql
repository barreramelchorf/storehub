-- Migrate product image URLs from absolute MinIO URLs to relative API URLs
-- Before: https://storehub.barreramelchorf.top/storehub/tenants/.../file.webp
-- After:  /api/public/storage/tenants/.../file.webp
-- This works by stripping everything before /tenants/ and prepending /api/public/storage/

UPDATE products
SET images = (
  SELECT jsonb_agg(
    to_jsonb(
      CASE
        WHEN elem_text LIKE '%/storehub/tenants/%'
        THEN '/api/public/storage/' || substring(elem_text FROM '.*/storehub/(.+)$')
        ELSE elem_text
      END
    )
  )
  FROM jsonb_array_elements_text(images) AS elem_text
)
WHERE images IS NOT NULL
  AND images != '[]'::jsonb
  AND images::text LIKE '%/storehub/tenants/%';

-- Migrate document file_path URLs
UPDATE documents
SET file_path = '/api/public/storage/' || substring(file_path FROM '.*/storehub/(.+)$')
WHERE file_path LIKE '%/storehub/tenants/%';
