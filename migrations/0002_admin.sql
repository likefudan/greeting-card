ALTER TABLE cards ADD COLUMN creation_key TEXT;
ALTER TABLE cards ADD COLUMN created_at INTEGER;
CREATE UNIQUE INDEX cards_creation_key ON cards(creation_key);
