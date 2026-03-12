import express from 'express';
import { pool } from './db/pool.js';
import { runMigrations } from './db/migrate.js';
import { env } from './config/env.js';
import { countryRoutes } from './routes/countryRoutes.js';
import { countryAttributeDefinitionRoutes } from './routes/countryAttributeDefinitionRoutes.js';
import { militaryInstallationRoutes } from './routes/militaryInstallationRoutes.js';
import { diplomacyRoutes } from './routes/diplomacyRoutes.js';

const app = express();
app.use(express.json());
app.use((request, response, next) => {
  response.header('Access-Control-Allow-Origin', env.clientOrigin);
  response.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  response.header('Access-Control-Allow-Headers', 'Content-Type');
  if (request.method === 'OPTIONS') {
    response.sendStatus(204);
    return;
  }
  next();
});

app.get('/health', async (_request, response, next) => {
  try {
    await pool.query('SELECT 1');
    response.json({ status: 'ok' });
  } catch (error) {
    next(error);
  }
});

app.use('/countries', countryRoutes);
app.use('/country-attribute-definitions', countryAttributeDefinitionRoutes);
app.use('/military-installations', militaryInstallationRoutes);
app.use('/diplomacy', diplomacyRoutes);

app.use((error, _request, response, _next) => {
  const statusCode = error.statusCode ?? 500;
  if (statusCode >= 500) {
    console.error(error);
  }
  response.status(statusCode).json({ error: error.message ?? 'Internal server error' });
});

async function startServer() {
  await runMigrations();
  app.listen(env.port, () => {
    console.log(`Deterrence API listening on port ${env.port}`);
  });
}

startServer().catch((error) => {
  console.error('Failed to start Deterrence API', error);
  process.exit(1);
});
