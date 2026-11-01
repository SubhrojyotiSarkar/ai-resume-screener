import path from 'node:path';

import { config as loadEnv } from 'dotenv';
import { defineConfig, env } from 'prisma/config';

// Prisma 7 no longer loads .env files itself. Locally, read the repo-root .env;
// in Docker and on Render the variables are already in the environment.
loadEnv({ path: path.resolve(import.meta.dirname, '../.env'), quiet: true });

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations', seed: 'node prisma/seed.js' },
  datasource: { url: env('DATABASE_URL') },
});
