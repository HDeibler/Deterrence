function requireEnv(name, fallback = null) {
  const value = process.env[name] ?? fallback;
  if (value === null || value === undefined || value === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  port: Number.parseInt(process.env.PORT ?? '3000', 10),
  databaseUrl: requireEnv('DATABASE_URL'),
  clientOrigin: process.env.CLIENT_ORIGIN ?? '*',
};
