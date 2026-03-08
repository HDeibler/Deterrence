# Military Data

## What Is Seeded

The country attribute model now includes a composite military profile assembled from multiple sources:

- personnel totals
- military expenditure in current USD
- military expenditure as percent of GDP
- arms imports trend-indicator value
- arms exports trend-indicator value
- 2014 equipment inventory snapshots for aircraft, helicopters, armoured fighting vehicles, artillery, major naval combatants, submarines, ballistic missiles, and UAVs
- 2025 nuclear warhead estimates for the nuclear-armed states

## Source Map

### World Bank indicator API

Used for the latest available per-country values for:

- `MS.MIL.TOTL.P1`
- `MS.MIL.XPND.CD`
- `MS.MIL.XPND.GD.ZS`
- `MS.MIL.MPRT.KD`
- `MS.MIL.XPRT.KD`

### rDMC Military Capabilities Dataset

Used for equipment inventories. Latest open year in this import is `2014`.

### SIPRI Yearbook 2025 summary

Used for nuclear warhead estimates at the start of `2025`.

## Important Limitations

- There is no single defensible open dataset that gives every country a current count for bases, planes, tanks, ships, missiles, and nuclear weapons all in one place.
- `Bases` are not seeded here because I did not find a reliable open global country-level dataset that meets the quality bar.
- `Tanks` are not available as a clean standalone open field in the imported rDMC slice. The seeded `armoured fighting vehicles` metric is the closest open proxy in this implementation.
- Equipment counts are not current-year values. They are explicitly labeled as `2014` snapshots.
- World Bank military indicators do not all update in the same year for every country.

## Regeneration

Rebuild the military seed migration with:

```bash
python3 scripts/build_country_military_seed_sql.py
```

Then apply it with:

```bash
npm run migrate
```
