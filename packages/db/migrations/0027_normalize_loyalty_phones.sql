-- Normalize existing loyalty card phones to bare 10-digit Mexican numbers, matching
-- the rule the app now enforces at enrollment (normalizeMxPhone): strip non-digits,
-- drop a leading 52 / 521 country prefix. Rows whose digits don't yield exactly 10
-- are LEFT UNTOUCHED (we never guess missing digits); they just won't match the
-- phone lookup until fixed by hand. Idempotent: already-normalized rows are skipped.
WITH cleaned AS (
  SELECT id,
         regexp_replace(customer_phone, '[^0-9]', '', 'g') AS d
  FROM loyalty_cards
  WHERE customer_phone IS NOT NULL
),
normalized AS (
  SELECT id,
         CASE
           WHEN length(d) = 13 AND d LIKE '521%' THEN substr(d, 4)
           WHEN length(d) = 12 AND d LIKE '52%'  THEN substr(d, 3)
           ELSE d
         END AS phone10
  FROM cleaned
)
UPDATE loyalty_cards c
SET customer_phone = n.phone10
FROM normalized n
WHERE c.id = n.id
  AND n.phone10 ~ '^[0-9]{10}$'
  AND c.customer_phone <> n.phone10;
