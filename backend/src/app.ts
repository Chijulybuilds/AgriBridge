import express from 'express';
import cors from 'cors';
import { router } from './routes/index.js';
import { notFound, errorHandler } from './middleware/errorHandler.js';

export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json());

  app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'agribridge-backend' }));

  app.use('/api', router);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
