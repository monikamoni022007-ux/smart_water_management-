import express, { Request, Response, NextFunction } from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { WaterDatabase } from './src/db/database';
import { AlertStatus } from './src/ooad/Alert';
import { ForecastMethodKey } from './src/ooad/Forecaster';

const PORT = 3000;

async function startServer() {
  const app = express();
  app.use(express.json());

  const db = new WaterDatabase();

  // Resolve authenticated user ID from header (defaults to user 1 only if explicitly requested or demo boot)
  function requireUserId(req: Request, res: Response): number | null {
    const rawHeader = req.header('x-user-id');
    const userId = rawHeader ? Number(rawHeader) : 1;
    if (!Number.isInteger(userId) || userId <= 0) {
      res.status(401).json({ error: 'Invalid user session.' });
      return null;
    }
    const user = db.getUserById(userId);
    if (!user) {
      res.status(401).json({ error: 'User account not found.' });
      return null;
    }
    return userId;
  }

  // Health
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  // Auth & User switching
  app.get('/api/users', (_req, res) => {
    res.json({ users: db.listUsers() });
  });

  app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body ?? {};
    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required.' });
      return;
    }
    const user = db.authenticateUser(String(email), String(password));
    if (!user) {
      res.status(401).json({ error: 'Invalid email or password.' });
      return;
    }
    res.json({ user: user.toPublicJSON() });
  });

  app.post('/api/auth/register', (req, res) => {
    const { name, email, password, householdName, householdSize } = req.body ?? {};
    if (!name || String(name).trim().length < 2) {
      res.status(400).json({ error: 'Full name must be at least 2 characters.' });
      return;
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email))) {
      res.status(400).json({ error: 'Please provide a valid email address.' });
      return;
    }
    if (!password || String(password).length < 4) {
      res.status(400).json({ error: 'Password must be at least 4 characters.' });
      return;
    }
    if (!householdName || String(householdName).trim().length < 2) {
      res.status(400).json({ error: 'Household name is required.' });
      return;
    }

    try {
      const created = db.createUser({
        name: String(name),
        email: String(email),
        password: String(password),
        householdName: String(householdName),
        householdSize: Number(householdSize) || 2,
      });
      res.status(201).json({ user: created.toPublicJSON() });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to register user.';
      if (message.includes('UNIQUE')) {
        res.status(409).json({ error: 'An account with this email already exists.' });
        return;
      }
      res.status(400).json({ error: message });
    }
  });

  // Workspace aggregate payload (all calculated from DB)
  app.get('/api/workspace', (req, res) => {
    const userId = requireUserId(req, res);
    if (!userId) return;

    const strategyParam = req.query.strategy as ForecastMethodKey | undefined;
    const horizonParam = req.query.horizon ? Number(req.query.horizon) : undefined;
    const validStrategy =
      strategyParam === 'linear_regression' || strategyParam === 'moving_average'
        ? strategyParam
        : undefined;

    const payload = db.getWorkspacePayload(userId, validStrategy, horizonParam);
    res.json(payload);
  });

  // Readings CRUD (strictly scoped to userId)
  app.post('/api/readings', (req, res) => {
    const userId = requireUserId(req, res);
    if (!userId) return;

    try {
      const created = db.addReading(userId, {
        date: String(req.body?.date ?? ''),
        volumeLiters: Number(req.body?.volumeLiters),
        nightFlowLph: Number(req.body?.nightFlowLph ?? 2.0),
        notes: String(req.body?.notes ?? ''),
        source: 'manual',
      });
      res.status(201).json({ reading: created.toJSON() });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Invalid reading input.' });
    }
  });

  app.put('/api/readings/:id', (req, res) => {
    const userId = requireUserId(req, res);
    if (!userId) return;

    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: 'Invalid reading ID.' });
      return;
    }

    try {
      const updated = db.updateReading(userId, id, {
        date: String(req.body?.date ?? ''),
        volumeLiters: Number(req.body?.volumeLiters),
        nightFlowLph: Number(req.body?.nightFlowLph ?? 0),
        notes: String(req.body?.notes ?? ''),
        source: req.body?.source,
      });
      res.json({ reading: updated.toJSON() });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Unable to update reading.' });
    }
  });

  app.delete('/api/readings/:id', (req, res) => {
    const userId = requireUserId(req, res);
    if (!userId) return;

    const id = Number(req.params.id);
    const deleted = db.deleteReading(userId, id);
    if (!deleted) {
      res.status(404).json({ error: 'Reading not found.' });
      return;
    }
    res.json({ deleted: true });
  });

  // Sample dataset actions
  app.post('/api/demo/load', (req, res) => {
    const userId = requireUserId(req, res);
    if (!userId) return;
    const variant = req.body?.variant === 'apartment14' ? 'apartment14' : 'full90';
    const insertedCount = db.loadSampleDataset(userId, variant);
    res.json({ insertedCount });
  });

  app.post('/api/demo/clear', (req, res) => {
    const userId = requireUserId(req, res);
    if (!userId) return;
    const removedCount = db.clearDemoDataset(userId);
    res.json({ removedCount });
  });

  // Settings & Leak thresholds
  app.put('/api/settings', (req, res) => {
    const userId = requireUserId(req, res);
    if (!userId) return;

    const body = req.body ?? {};
    const spike = Number(body.spikePercentThreshold);
    const highRisk = Number(body.highRiskPercentThreshold);
    const nightFlow = Number(body.nightFlowThresholdLph);
    const consecutive = Number(body.consecutiveAbnormalDays);
    const zThresh = Number(body.historicalZThreshold);
    const horizon = Number(body.forecastHorizonDays);

    if (
      (body.spikePercentThreshold !== undefined && (Number.isNaN(spike) || spike < 5 || spike > 300)) ||
      (body.highRiskPercentThreshold !== undefined && (Number.isNaN(highRisk) || highRisk < 10 || highRisk > 500)) ||
      (body.nightFlowThresholdLph !== undefined && (Number.isNaN(nightFlow) || nightFlow < 1 || nightFlow > 500)) ||
      (body.consecutiveAbnormalDays !== undefined && (Number.isNaN(consecutive) || consecutive < 1 || consecutive > 14)) ||
      (body.historicalZThreshold !== undefined && (Number.isNaN(zThresh) || zThresh < 1 || zThresh > 6)) ||
      (body.forecastHorizonDays !== undefined && (Number.isNaN(horizon) || horizon < 1 || horizon > 90))
    ) {
      res.status(400).json({ error: 'One or more threshold or forecast parameters are out of valid bounds.' });
      return;
    }

    const updated = db.updateUserSettings(userId, {
      forecastStrategy:
        body.forecastStrategy === 'moving_average' || body.forecastStrategy === 'linear_regression'
          ? body.forecastStrategy
          : undefined,
      forecastHorizonDays: body.forecastHorizonDays !== undefined ? Math.round(horizon) : undefined,
      spikePercentThreshold: body.spikePercentThreshold !== undefined ? spike : undefined,
      highRiskPercentThreshold: body.highRiskPercentThreshold !== undefined ? highRisk : undefined,
      nightFlowThresholdLph: body.nightFlowThresholdLph !== undefined ? nightFlow : undefined,
      consecutiveAbnormalDays: body.consecutiveAbnormalDays !== undefined ? Math.round(consecutive) : undefined,
      historicalZThreshold: body.historicalZThreshold !== undefined ? zThresh : undefined,
    });
    res.json({ settings: updated });
  });

  // Alert lifecycle actions
  app.patch('/api/alerts/:id', (req, res) => {
    const userId = requireUserId(req, res);
    if (!userId) return;

    const alertId = Number(req.params.id);
    const status = req.body?.status as AlertStatus;
    if (status !== 'Active' && status !== 'Acknowledged' && status !== 'Resolved') {
      res.status(400).json({ error: 'Invalid alert status.' });
      return;
    }

    const updated = db.updateAlertStatus(userId, alertId, status);
    if (!updated) {
      res.status(404).json({ error: 'Alert not found.' });
      return;
    }
    res.json({ alert: updated });
  });

  // Conservation Goals
  app.put('/api/conservation', (req, res) => {
    const userId = requireUserId(req, res);
    if (!userId) return;

    try {
      const updated = db.updateConservationGoal(userId, {
        userId,
        dailyTargetLiters: Number(req.body?.dailyTargetLiters),
        monthlyLimitLiters: Number(req.body?.monthlyLimitLiters),
        baselineDailyLiters: Number(req.body?.baselineDailyLiters),
        actionStartDate: String(req.body?.actionStartDate ?? ''),
        actionLabel: String(req.body?.actionLabel ?? ''),
      });
      res.json({ goal: updated });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Invalid conservation goal.' });
    }
  });

  // Error handler
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error('Server error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  });

  // Vite middleware in dev / static dist in production
  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`AquaLedger running on http://localhost:${PORT}`);
  });
}

startServer();
