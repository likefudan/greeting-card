ALTER TABLE cards ADD COLUMN slug TEXT;
CREATE UNIQUE INDEX cards_slug ON cards(slug);
