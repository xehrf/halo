INSERT INTO categories (name, slug)
VALUES
  ('Кольца', 'koltsa'),
  ('Браслеты', 'braslety'),
  ('Цепочки', 'tsepochki'),
  ('Серьги', 'sergi')
ON CONFLICT (slug) DO NOTHING;
