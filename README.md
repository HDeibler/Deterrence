# Deterrence

<img width="1865" height="958" alt="Screenshot 2026-03-08 at 6 42 17 PM" src="https://github.com/user-attachments/assets/a36e63a5-6e0d-48cd-83c7-3cb7cc2f4aa8" />


<img width="644" height="630" alt="Screenshot 2026-03-08 at 6 42 27 PM" src="https://github.com/user-attachments/assets/c887b05f-a3bd-4aac-99dd-2420db9b41bc" />


<img width="272" height="236" alt="Screenshot 2026-03-08 at 6 43 18 PM" src="https://github.com/user-attachments/assets/e9e7bc81-e852-43d6-a705-8d75fb8b5f7b" />


<img width="1003" height="799" alt="Screenshot 2026-03-08 at 6 45 29 PM" src="https://github.com/user-attachments/assets/c0e9879b-d282-440b-8290-bf5dbdaf45db" />


<img width="789" height="768" alt="Screenshot 2026-03-08 at 6 46 24 PM" src="https://github.com/user-attachments/assets/7cba4d26-0576-4c60-9673-dcef257bb0d5" />


<img width="1114" height="723" alt="Screenshot 2026-03-08 at 6 46 12 PM" src="https://github.com/user-attachments/assets/bf06a302-3e5c-4b43-9128-961a41121a5b" />


<img width="372" height="203" alt="Screenshot 2026-03-08 at 6 33 00 PM" src="https://github.com/user-attachments/assets/5f6406b2-b9c2-4487-a773-cd4ab2dbce62" />


<img width="1159" height="766" alt="Screenshot 2026-03-08 at 6 47 42 PM" src="https://github.com/user-attachments/assets/a35f9063-442e-4c65-abfe-80ed56a53424" />

A continuous-time grand-strategy and deterrence simulation built around real geography, military basing, ballistic missile physics, radar
  coverage, logistics, and eventually resource-driven force generation.

  ## Overview

  Deterrence models strategic power as something that must be built, moved, sustained, and defended.

  The current foundation includes:

  - a 3D Earth client with selectable major powers: `USA`, `CHN`, and `RUS`
  - real-world military installation overlays and country-aware visibility
  - ballistic missile launches with staged flight, predicted trajectories, and impact estimation
  - radar placement, early-warning satellites, and orbital launch mechanics
  - naval asset scaffolding and global basing concepts
  - a backend API and migration pipeline for country and installation data

  The next phase expands this into a full continuous-time economy and logistics simulation where industrial output, foreign resource access,
  hub basing, and forward deployment drive military power.

  ## Repository Structure

  - `packages/app`: browser client, simulation, rendering, overlays, UI, and local public assets
  - `packages/server`: API, PostgreSQL migrations, country data, and military installation services
  - `scripts`: deterministic dataset builders and workspace helpers
  - `docs`: architecture notes, military data references, and next-phase planning
  - `tmp`: local scratch space for upstream datasets and build inputs

  ## Local Development

  Install dependencies:

  ```bash
  npm install

  Start Postgres:

  npm run docker:up

  Start the frontend and backend together:

  npm run start

  Stop Docker services:

  npm run docker:down

  ## Tooling

  Format check:

  npm run format:check

  Format all files:

  npm run format

  Lint:

  npm run lint

  Syntax / type-style validation:

  npm run typecheck

  ## Default Local Services

  - client: http://localhost:4173
  - api: http://localhost:3000
  - postgres: localhost:55432

  ## Environment

  A root reference file is included at example.env.

  Active package env files are expected at:

  - packages/app/.env
  - packages/server/.env

  Current core variables:

  - app: VITE_API_PORT
  - server: PORT, DATABASE_URL, CLIENT_ORIGIN

  ## Current Data Model
```
  The backend currently seeds and serves:

  - country directory data
  - military-related country attributes
  - military installations
  - expanded strategic installation coverage for USA, CHN, and RUS
  - curated Russia and China strategic ports, air bases, launch facilities, and spaceports

  Useful endpoints include:

  - GET /health
  - GET /countries
  - GET /countries/directory
  - GET /countries/:isoCode
  - GET /countries/:isoCode/attributes
  - GET /military-installations

  ## Project Direction

  The planned next phase is a continuous-time strategic layer built around:

  - oil and rare-earth extraction
  - chip and military asset production
  - transport assets such as cargo aircraft and oil ships
  - hub bases as theater logistics anchors
  - sticky forward deployment to real-world bases
  - ongoing sustainment cost and logistics demand
  - foreign resource contracts and geopolitical negotiation
  - supply-chain disruption through strikes, interdiction, and war

  The design goal is simple: power should not spawn instantly. It should emerge from industrial capacity, logistics reach, diplomacy, and
  sustained strategic planning.

  See docs/plan.md for the current full roadmap.
