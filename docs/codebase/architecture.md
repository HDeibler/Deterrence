# Deterrence Codebase Layout

## Workspace Packages

- `packages/app`: browser client, static assets, Earth rendering, overlays, and UI chrome
- `packages/server`: API, migrations, data access, and country attribute model

## Root Support Directories

- `scripts`: deterministic dataset and seed builders
- `tmp`: downloaded source datasets and scratch extraction directories
- `docs`: codebase documentation

## Intent

This layout keeps runnable software inside `packages/` and leaves root-level directories for operations, docs, and build inputs.
