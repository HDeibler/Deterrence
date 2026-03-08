# Deterrence

A workspace-based monorepo for the Deterrence Earth client and backend platform.

## Structure

- `packages/app`: browser client, static assets, simulation, overlays, and UI
- `packages/server`: API, migrations, and country data model
- `scripts`: deterministic dataset and SQL generation scripts
- `tmp`: downloaded upstream source data used by the scripts
- `docs`: codebase documentation

## Run

App and backend together:

```bash
npm run start
```

Client only:

```bash
npm run start:app
```

API and Postgres in detached mode:

```bash
npm run docker:up
```

Manual migration run:

```bash
npm run migrate
```

## Services

- client: `http://localhost:4173`
- api: `http://localhost:3000`
- postgres: `localhost:55432`

## Workspace Packages

### `packages/app`

- `src/`: browser application code
- `public/`: local textures and datasets
- `index.html`: app shell entrypoint

### `packages/server`

- `src/`: API runtime
- `migrations/`: ordered SQL migrations
- `Dockerfile`: API container image

## Military Data

Country military attributes are seeded into the generic country attribute tables.

Current seeded military fields come from:

- World Bank military indicators
- rDMC Military Capabilities Dataset
- SIPRI Yearbook 2025 nuclear inventory estimates

Query them with:

- `GET /countries/:isoCode/attributes`

Important limitations:

- no defensible open global `bases` dataset is seeded
- `tanks` are represented by the broader `armoured fighting vehicles` metric
- equipment counts are `2014` snapshots, not current-year inventories

Regenerate the military migration with:

```bash
python3 scripts/build_country_military_seed_sql.py
```

## API

- `GET /health`
- `GET /countries`
- `GET /countries/directory`
- `GET /countries/:isoCode`
- `GET /countries/:isoCode/attributes`
- `POST /countries/:isoCode/attributes`
- `GET /country-attribute-definitions`
- `POST /country-attribute-definitions`
