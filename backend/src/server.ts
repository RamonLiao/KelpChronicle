import express from 'express';
import cors from 'cors';
import { makeRoutes } from './routes.js';

const app = express();
app.use(express.json({ limit: '5mb' }));
app.use(cors({ origin: (process.env.CORS_ORIGIN ?? 'http://localhost:5173').split(',') }));

app.get('/health', (_req, res) => res.json({ ok: true }));

const routes = makeRoutes(); // one instance → one shared single-flight lock for the process

app.post('/run', async (req, res) => {
  const { status, body } = await routes.runHandler({ topic: req.body?.topic, agent: req.body?.agent });
  res.status(status).json(body);
});

app.get('/memory', async (req, res) => {
  const { status, body } = await routes.memoryHandler({ topic: req.query?.topic });
  res.status(status).json(body);
});

app.get('/attestations', async (req, res) => {
  const { status, body } = await routes.attestationsHandler({ agent: req.query?.agent, namespace: req.query?.namespace });
  res.status(status).json(body);
});

app.post('/restore', async (_req, res) => {
  const { status, body } = await routes.restoreHandler();
  res.status(status).json(body);
});

const PORT = Number(process.env.PORT ?? 8788);
app.listen(PORT, () => console.log(`Recall backend on :${PORT}`));
