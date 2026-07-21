-- Link categories to modifier groups (many-to-many)
-- Products in a category inherit these modifier groups by default
CREATE TABLE IF NOT EXISTS category_modifier_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  group_id UUID NOT NULL REFERENCES modifier_groups(id) ON DELETE CASCADE,
  UNIQUE(category_id, group_id)
);

CREATE INDEX IF NOT EXISTS category_modifier_groups_category_idx ON category_modifier_groups(category_id);
