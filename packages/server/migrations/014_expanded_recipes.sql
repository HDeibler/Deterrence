-- Expand the output_type CHECK to allow 'asset' for deployable unit recipes.
ALTER TABLE strategic_recipes DROP CONSTRAINT IF EXISTS chk_strategic_recipe_output_type;
ALTER TABLE strategic_recipes ADD CONSTRAINT chk_strategic_recipe_output_type
  CHECK (output_type IN ('resource', 'inventory', 'asset'));

-- Also expand facility_type to allow 'shipyard' for future naval production.
ALTER TABLE strategic_recipes DROP CONSTRAINT IF EXISTS chk_strategic_recipe_facility_type;
ALTER TABLE strategic_recipes ADD CONSTRAINT chk_strategic_recipe_facility_type
  CHECK (facility_type IN ('chip_factory', 'military_factory', 'shipyard'));

-- Expanded recipe catalog: cruisers, submarines, cargo planes, oil tankers,
-- fighters, interceptors, launch vehicles, and orbital-watch payloads.
INSERT INTO strategic_recipes
  (key, name, facility_type, output_type, output_key, output_amount, duration_hours, oil_cost, rare_earth_cost, chip_cost)
VALUES
  ('cruiser-build',           'Cruiser Construction',    'military_factory', 'asset', 'surface_ship',             1,  72.0000, 180.0000,  8.0000,  45.0000),
  ('submarine-build',         'Submarine Construction',  'military_factory', 'asset', 'submarine',                1,  96.0000, 220.0000, 12.0000,  60.0000),
  ('cargo-plane-build',       'Cargo Plane Assembly',    'military_factory', 'asset', 'cargo_plane',              2,  36.0000,  85.0000,  3.0000,  32.0000),
  ('oil-tanker-build',        'Oil Tanker Construction', 'military_factory', 'asset', 'oil_tanker',               1,  48.0000, 140.0000,  5.0000,  20.0000),
  ('fighter-build',           'Fighter Production',      'military_factory', 'asset', 'fighter',                  4,  24.0000,  60.0000,  4.0000,  38.0000),
  ('interceptor-build',       'Interceptor Production',  'military_factory', 'asset', 'interceptor',              2,  30.0000,  75.0000,  6.0000,  50.0000),
  ('launch-vehicle-assembly', 'Launch Vehicle Assembly', 'military_factory', 'asset', 'launch_vehicle',           1, 120.0000, 160.0000, 10.0000,  80.0000),
  ('orbital-watch',           'Orbital Watch Payload',   'chip_factory',     'asset', 'early_warning_satellite',  1,  48.0000,  20.0000,  4.0000, 120.0000)
ON CONFLICT (key) DO NOTHING;
