BEGIN;

UPDATE military_installations
SET installation_type = 'military_base'
WHERE name IN (
  'Wenchang Space Launch Site',
  'Jiuquan Satellite Launch Center',
  'Taiyuan Satellite Launch Center',
  'Xichang Satellite Launch Center',
  'Plesetsk Cosmodrome',
  'Vostochny Cosmodrome'
)
  AND installation_type = 'missile_launch_facility';

COMMIT;
