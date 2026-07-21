-- Add modifiers column to sale_items to record which modifiers were selected
ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS modifiers JSONB NOT NULL DEFAULT '[]'::jsonb;
