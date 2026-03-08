import { pool } from './db/pool.js';
import { runMigrations } from './db/migrate.js';

runMigrations()
  .then(async () => {
    await pool.end();
  })
  .catch(async (error) => {
    console.error('Migration failed', error);
    await pool.end();
    process.exit(1);
  });
