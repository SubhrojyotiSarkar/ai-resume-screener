import cors from 'cors';
import express from 'express';
import helmet from 'helmet';

import { config } from './config.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';
import applicationRoutes from './routes/applications.routes.js';
import authRoutes from './routes/auth.routes.js';
import healthRoutes from './routes/health.routes.js';
import jobRoutes from './routes/jobs.routes.js';
import resumeRoutes from './routes/resumes.routes.js';

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', 1); // Render and other hosts sit behind a proxy.

  app.use(helmet());
  app.use(cors({ origin: config.clientUrl }));
  app.use(express.json({ limit: '1mb' }));

  // /health for container and platform probes, /api/health for the client.
  app.use('/health', healthRoutes);
  app.use('/api/health', healthRoutes);

  // Opening the API URL in a browser shouldn't look like an error.
  app.get(['/', '/api'], (req, res) => {
    res.json({ service: 'resume-screener-api', status: 'ok', health: '/health', docs: 'See README.md' });
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/jobs', jobRoutes);
  app.use('/api/applications', applicationRoutes);
  app.use('/api/resumes', resumeRoutes);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
