# Military Installations Data

## What Is Seeded

The installation layer is a merged strategic-site dataset used by the game map and launch/radar flows.

It currently includes:

- overseas bases from the HKU overseas military bases dataset
- U.S. ICBM silos from the ALC Press XML feed
- Russian ICBM fields from the Federation of American Scientists list
- Chinese PLARF missile bases from open-source strategic-force reporting
- curated strategic installations for `USA`, `RUS`, and `CHN`, including:
  - spaceports / launch centers
  - strategic air bases
  - naval bases / fleet ports
  - key missile launch facilities

## Current Source Map

- HKU Overseas Military Bases dataset
- ALC Press active ICBM silo map
- Federation of American Scientists Russian ICBM base list
- CGWIC launch-site pages for Chinese spaceports
- Roscosmos official cosmodrome pages for Russian spaceports
- GlobalSecurity fleet / naval-base / airfield reference pages for Russia and China

## Important Limitations

- There is still no single current, official, globally complete machine-readable military-base dataset for Russia or China.
- The Russia/China additions are intentionally curated strategic sites, not every installation operated by either country.
- Some coordinates are normalized to decimal degrees from source pages, and some naval/air entries are approximate base-area coordinates rather than exact gate coordinates.
- Spaceports are currently represented with existing installation types, mainly `missile_launch_facility`, because the schema does not yet have a dedicated `spaceport` type.

## Why The 2026 Expansion Uses A Forward Migration

The original installation seed generator depends on a local HKU shapefile path outside the repo. The `006` migration adds Russia/China strategic assets without rewriting historical migrations or depending on that local file.

## Next Cleanup Step

If we want this fully reproducible, the next step is to check in a normalized source snapshot for installations and have the seed generator read only repo-local data.
