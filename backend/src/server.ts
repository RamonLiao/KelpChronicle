import express from 'express';
import cors from 'cors';

const app = express();
app.use(express.json({ limit: '5mb' }));
app.use(cors({ origin: (process.env.CORS_ORIGIN ?? 'http://localhost:5173').split(',') }));

app.get('/health', (_req, res) => res.json({ ok: true }));

const PORT = Number(process.env.PORT ?? 8788);
app.listen(PORT, () => console.log(`Recall backend on :${PORT}`));
