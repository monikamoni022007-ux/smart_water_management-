import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import path from 'node:path';
import {
  Alert,
  AlertObserver,
  AlertProps,
  AlertStatus,
} from '../ooad/Alert';
import {
  ConservationGoalProps,
  ConservationManager,
  ConservationProgress,
} from '../ooad/ConservationManager';
import {
  generateDeterministicDemoDataset,
  generateSecondaryApartmentDataset,
} from '../ooad/DemoData';
import { ForecastMethodKey, ForecastResult } from '../ooad/Forecaster';
import {
  DEFAULT_LEAK_THRESHOLDS,
  LeakAnalysisResult,
  LeakDetector,
  LeakThresholds,
} from '../ooad/LeakDetector';
import { DataSource, Reading, ReadingInput } from '../ooad/Reading';
import { FlowSensor } from '../ooad/Sensor';
import { UsagePredictor } from '../ooad/UsagePredictor';
import { User, UserProps } from '../ooad/User';
import { AggregatedPeriod, UsageSummaryMetrics, WaterMeter } from '../ooad/WaterMeter';

export interface UserSettings extends LeakThresholds {
  userId: number;
  forecastStrategy: ForecastMethodKey;
  forecastHorizonDays: number;
}

export interface WorkspacePayload {
  user: UserProps;
  meterId: string;
  sensorInfo: {
    sensorId: string;
    location: string;
    pipeDiameterMm: number;
    unit: string;
  };
  settings: UserSettings;
  summary: UsageSummaryMetrics;
  readings: ReturnType<Reading['toJSON']>[];
  weekly: AggregatedPeriod[];
  monthly: AggregatedPeriod[];
  forecast: ForecastResult;
  leakAnalysis: {
    overallRiskLevel: LeakAnalysisResult['overallRiskLevel'];
    activeAlertsCount: number;
    lastAnalyzedDate: string | null;
  };
  alerts: AlertProps[];
  conservation: ConservationProgress;
}

export function getTodayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDaysISO(dateStr: string, delta: number): string {
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

function hashPassword(password: string): string {
  const salt = 'aqualedger-capstone-salt';
  return crypto.scryptSync(password, salt, 32).toString('hex');
}

class SqliteAlertObserver implements AlertObserver {
  public readonly detected: Alert[] = [];
  public update(alert: Alert): void {
    this.detected.push(alert);
  }
}

export class WaterDatabase {
  private readonly db: DatabaseSync;

  constructor(dbPath = path.resolve(process.cwd(), 'water_management.db')) {
    this.db = new DatabaseSync(dbPath);
    this.db.exec('PRAGMA foreign_keys = ON;');
    this.initSchema();
    this.seedInitialUsers();
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        household_name TEXT NOT NULL,
        household_size INTEGER NOT NULL DEFAULT 3,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS water_readings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        meter_id TEXT NOT NULL,
        date TEXT NOT NULL,
        volume_liters REAL NOT NULL,
        night_flow_lph REAL NOT NULL DEFAULT 2.0,
        source TEXT NOT NULL DEFAULT 'manual',
        notes TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_readings_user_date
        ON water_readings (user_id, date);

      CREATE TABLE IF NOT EXISTS alerts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        date TEXT NOT NULL,
        risk_level TEXT NOT NULL,
        rule_triggered TEXT NOT NULL,
        reason TEXT NOT NULL,
        expected_liters REAL NOT NULL,
        actual_liters REAL NOT NULL,
        night_flow_lph REAL NOT NULL DEFAULT 0,
        recommended_action TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'Active',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_alerts_user_date
        ON alerts (user_id, date);

      CREATE TABLE IF NOT EXISTS conservation_goals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL UNIQUE,
        daily_target_liters REAL NOT NULL,
        monthly_limit_liters REAL NOT NULL,
        baseline_daily_liters REAL NOT NULL,
        action_start_date TEXT NOT NULL,
        action_label TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS user_settings (
        user_id INTEGER PRIMARY KEY,
        forecast_strategy TEXT NOT NULL DEFAULT 'linear_regression',
        forecast_horizon_days INTEGER NOT NULL DEFAULT 14,
        spike_percent_threshold REAL NOT NULL DEFAULT 30,
        high_risk_percent_threshold REAL NOT NULL DEFAULT 60,
        night_flow_threshold_lph REAL NOT NULL DEFAULT 12,
        consecutive_abnormal_days INTEGER NOT NULL DEFAULT 2,
        historical_z_threshold REAL NOT NULL DEFAULT 2.0,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
    `);
  }

  private seedInitialUsers(): void {
    const countRow = this.db.prepare('SELECT COUNT(*) as cnt FROM users').get() as { cnt: number };
    if (countRow.cnt > 0) return;

    const today = getTodayISO();
    const actionDate = addDaysISO(today, -22);

    // User 1: Primary demo household with 92-day deterministic dataset
    const u1 = this.createUser({
      name: 'Alex Mercer',
      email: 'alex@aqualedger.edu',
      password: 'demo123',
      householdName: 'Mercer Residence',
      householdSize: 3,
    });
    this.updateConservationGoal(u1.id, {
      userId: u1.id,
      dailyTargetLiters: 310,
      monthlyLimitLiters: 9400,
      baselineDailyLiters: 342,
      actionStartDate: actionDate,
      actionLabel: 'Installed low-flow faucet aerators and replaced toilet cistern seal',
    });
    this.loadSampleDataset(u1.id, 'full90', today);

    // User 2: Secondary user for strict isolation demonstration
    const u2 = this.createUser({
      name: 'Priya Nair',
      email: 'priya@aqualedger.edu',
      password: 'demo123',
      householdName: 'Nair Apartment',
      householdSize: 2,
    });
    this.updateConservationGoal(u2.id, {
      userId: u2.id,
      dailyTargetLiters: 210,
      monthlyLimitLiters: 6300,
      baselineDailyLiters: 225,
      actionStartDate: addDaysISO(today, -10),
      actionLabel: 'Switched to eco-cycle washing program',
    });
    this.loadSampleDataset(u2.id, 'apartment14', today);
  }

  public listUsers(): UserProps[] {
    const rows = this.db
      .prepare('SELECT id, name, email, household_name, household_size, created_at FROM users ORDER BY id ASC')
      .all() as Array<{
      id: number;
      name: string;
      email: string;
      household_name: string;
      household_size: number;
      created_at: string;
    }>;

    return rows.map((r) =>
      new User({
        id: r.id,
        name: r.name,
        email: r.email,
        householdName: r.household_name,
        householdSize: r.household_size,
        createdAt: r.created_at,
      }).toPublicJSON()
    );
  }

  public getUserById(userId: number): User | null {
    const row = this.db
      .prepare('SELECT id, name, email, household_name, household_size, created_at FROM users WHERE id = ?')
      .get(userId) as
      | {
          id: number;
          name: string;
          email: string;
          household_name: string;
          household_size: number;
          created_at: string;
        }
      | undefined;

    if (!row) return null;
    return new User({
      id: row.id,
      name: row.name,
      email: row.email,
      householdName: row.household_name,
      householdSize: row.household_size,
      createdAt: row.created_at,
    });
  }

  public authenticateUser(email: string, password: string): User | null {
    const normalized = email.trim().toLowerCase();
    const row = this.db
      .prepare(
        'SELECT id, name, email, password_hash, household_name, household_size, created_at FROM users WHERE lower(email) = ?'
      )
      .get(normalized) as
      | {
          id: number;
          name: string;
          email: string;
          password_hash: string;
          household_name: string;
          household_size: number;
          created_at: string;
        }
      | undefined;

    if (!row) return null;
    if (row.password_hash !== hashPassword(password)) return null;

    return new User({
      id: row.id,
      name: row.name,
      email: row.email,
      householdName: row.household_name,
      householdSize: row.household_size,
      createdAt: row.created_at,
    });
  }

  public createUser(params: {
    name: string;
    email: string;
    password: string;
    householdName: string;
    householdSize: number;
  }): User {
    const email = params.email.trim().toLowerCase();
    const passwordHash = hashPassword(params.password);

    const insert = this.db.prepare(
      'INSERT INTO users (name, email, password_hash, household_name, household_size) VALUES (?, ?, ?, ?, ?)'
    );
    const result = insert.run(
      params.name.trim(),
      email,
      passwordHash,
      params.householdName.trim(),
      Math.max(1, Math.min(20, Math.round(params.householdSize)))
    );

    const userId = Number(result.lastInsertRowid);
    const user = this.getUserById(userId)!;

    // Default settings & conservation goal
    this.db
      .prepare(
        `INSERT INTO user_settings (
          user_id, forecast_strategy, forecast_horizon_days,
          spike_percent_threshold, high_risk_percent_threshold,
          night_flow_threshold_lph, consecutive_abnormal_days, historical_z_threshold
        ) VALUES (?, 'linear_regression', 14, ?, ?, ?, ?, ?)`
      )
      .run(
        userId,
        DEFAULT_LEAK_THRESHOLDS.spikePercentThreshold,
        DEFAULT_LEAK_THRESHOLDS.highRiskPercentThreshold,
        DEFAULT_LEAK_THRESHOLDS.nightFlowThresholdLph,
        DEFAULT_LEAK_THRESHOLDS.consecutiveAbnormalDays,
        DEFAULT_LEAK_THRESHOLDS.historicalZThreshold
      );

    const target = user.getRecommendedPerCapitaTarget();
    this.db
      .prepare(
        `INSERT INTO conservation_goals (
          user_id, daily_target_liters, monthly_limit_liters, baseline_daily_liters, action_start_date, action_label
        ) VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(
        userId,
        target,
        target * 30,
        Math.round(target * 1.15),
        addDaysISO(getTodayISO(), -14),
        'Baseline conservation monitoring plan'
      );

    return user;
  }

  public getUserSettings(userId: number): UserSettings {
    const row = this.db
      .prepare('SELECT * FROM user_settings WHERE user_id = ?')
      .get(userId) as
      | {
          user_id: number;
          forecast_strategy: ForecastMethodKey;
          forecast_horizon_days: number;
          spike_percent_threshold: number;
          high_risk_percent_threshold: number;
          night_flow_threshold_lph: number;
          consecutive_abnormal_days: number;
          historical_z_threshold: number;
        }
      | undefined;

    if (!row) {
      return {
        userId,
        forecastStrategy: 'linear_regression',
        forecastHorizonDays: 14,
        ...DEFAULT_LEAK_THRESHOLDS,
      };
    }

    return {
      userId: row.user_id,
      forecastStrategy: row.forecast_strategy,
      forecastHorizonDays: row.forecast_horizon_days,
      spikePercentThreshold: row.spike_percent_threshold,
      highRiskPercentThreshold: row.high_risk_percent_threshold,
      nightFlowThresholdLph: row.night_flow_threshold_lph,
      consecutiveAbnormalDays: row.consecutive_abnormal_days,
      historicalZThreshold: row.historical_z_threshold,
    };
  }

  public updateUserSettings(userId: number, patch: Partial<UserSettings>): UserSettings {
    const current = this.getUserSettings(userId);
    const definedPatch = Object.fromEntries(
      Object.entries(patch).filter(([, value]) => value !== undefined)
    ) as Partial<UserSettings>;
    const merged: UserSettings = {
      ...current,
      ...definedPatch,
      userId,
    };

    this.db
      .prepare(
        `UPDATE user_settings
         SET forecast_strategy = ?,
             forecast_horizon_days = ?,
             spike_percent_threshold = ?,
             high_risk_percent_threshold = ?,
             night_flow_threshold_lph = ?,
             consecutive_abnormal_days = ?,
             historical_z_threshold = ?
         WHERE user_id = ?`
      )
      .run(
        merged.forecastStrategy,
        merged.forecastHorizonDays,
        merged.spikePercentThreshold,
        merged.highRiskPercentThreshold,
        merged.nightFlowThresholdLph,
        merged.consecutiveAbnormalDays,
        merged.historicalZThreshold,
        userId
      );

    this.recomputeAlertsForUser(userId);
    return this.getUserSettings(userId);
  }

  public getReadingsForUser(userId: number): Reading[] {
    const rows = this.db
      .prepare(
        'SELECT id, user_id, meter_id, date, volume_liters, night_flow_lph, source, notes, created_at FROM water_readings WHERE user_id = ? ORDER BY date ASC, id ASC'
      )
      .all(userId) as Array<{
      id: number;
      user_id: number;
      meter_id: string;
      date: string;
      volume_liters: number;
      night_flow_lph: number;
      source: DataSource;
      notes: string;
      created_at: string;
    }>;

    return rows.map(
      (r) =>
        new Reading({
          id: r.id,
          userId: r.user_id,
          meterId: r.meter_id,
          date: r.date,
          volumeLiters: r.volume_liters,
          nightFlowLph: r.night_flow_lph,
          source: r.source,
          notes: r.notes,
          createdAt: r.created_at,
        })
    );
  }

  public addReading(userId: number, input: ReadingInput): Reading {
    const user = this.getUserById(userId);
    if (!user) throw new Error('User not found.');

    const sensor = new FlowSensor(`FS-${user.getMeterId()}`);
    const validated = sensor.captureReading({
      id: 0,
      userId,
      meterId: user.getMeterId(),
      date: input.date,
      volumeLiters: Number(input.volumeLiters),
      nightFlowLph: Number(input.nightFlowLph),
      source: input.source ?? 'manual',
      notes: input.notes ?? '',
    });

    const result = this.db
      .prepare(
        `INSERT INTO water_readings (user_id, meter_id, date, volume_liters, night_flow_lph, source, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        userId,
        validated.meterId,
        validated.date,
        validated.volumeLiters,
        validated.nightFlowLph,
        validated.source,
        validated.notes
      );

    const createdId = Number(result.lastInsertRowid);
    this.recomputeAlertsForUser(userId);

    return new Reading({
      ...validated.toJSON(),
      id: createdId,
    });
  }

  public updateReading(userId: number, readingId: number, input: ReadingInput): Reading {
    const existing = this.db
      .prepare('SELECT id, source FROM water_readings WHERE id = ? AND user_id = ?')
      .get(readingId, userId) as { id: number; source: DataSource } | undefined;

    if (!existing) {
      throw new Error('Reading not found for current user.');
    }

    const validation = Reading.validateInput(input);
    if (!validation.valid) {
      throw new Error(validation.errors.join(' '));
    }

    this.db
      .prepare(
        `UPDATE water_readings
         SET date = ?, volume_liters = ?, night_flow_lph = ?, notes = ?, source = ?
         WHERE id = ? AND user_id = ?`
      )
      .run(
        input.date,
        Number(Number(input.volumeLiters).toFixed(1)),
        Number(Number(input.nightFlowLph).toFixed(1)),
        input.notes ?? '',
        input.source ?? existing.source,
        readingId,
        userId
      );

    this.recomputeAlertsForUser(userId);

    const row = this.db
      .prepare('SELECT * FROM water_readings WHERE id = ? AND user_id = ?')
      .get(readingId, userId) as {
      id: number;
      user_id: number;
      meter_id: string;
      date: string;
      volume_liters: number;
      night_flow_lph: number;
      source: DataSource;
      notes: string;
      created_at: string;
    };

    return new Reading({
      id: row.id,
      userId: row.user_id,
      meterId: row.meter_id,
      date: row.date,
      volumeLiters: row.volume_liters,
      nightFlowLph: row.night_flow_lph,
      source: row.source,
      notes: row.notes,
      createdAt: row.created_at,
    });
  }

  public deleteReading(userId: number, readingId: number): boolean {
    const res = this.db
      .prepare('DELETE FROM water_readings WHERE id = ? AND user_id = ?')
      .run(readingId, userId);

    if (res.changes > 0) {
      this.recomputeAlertsForUser(userId);
      return true;
    }
    return false;
  }

  public loadSampleDataset(
    userId: number,
    variant: 'full90' | 'apartment14' = 'full90',
    anchorDate = getTodayISO()
  ): number {
    const user = this.getUserById(userId);
    if (!user) throw new Error('User not found.');

    const dataset =
      variant === 'apartment14'
        ? generateSecondaryApartmentDataset(anchorDate)
        : generateDeterministicDemoDataset(anchorDate);

    // Replace existing demo records so repeated clicks stay deterministic & clean,
    // while preserving user-entered manual records!
    this.db.prepare("DELETE FROM water_readings WHERE user_id = ? AND source = 'demo'").run(userId);

    const insert = this.db.prepare(
      `INSERT INTO water_readings (user_id, meter_id, date, volume_liters, night_flow_lph, source, notes)
       VALUES (?, ?, ?, ?, ?, 'demo', ?)`
    );

    const meterId = user.getMeterId();
    for (const item of dataset) {
      insert.run(userId, meterId, item.date, item.volumeLiters, item.nightFlowLph, item.notes ?? '');
    }

    this.recomputeAlertsForUser(userId);
    return dataset.length;
  }

  public clearDemoDataset(userId: number): number {
    const res = this.db.prepare("DELETE FROM water_readings WHERE user_id = ? AND source = 'demo'").run(userId);
    this.recomputeAlertsForUser(userId);
    return Number(res.changes);
  }

  public recomputeAlertsForUser(userId: number): void {
    const readings = this.getReadingsForUser(userId);
    const settings = this.getUserSettings(userId);

    const predictor = new UsagePredictor(UsagePredictor.createStrategy(settings.forecastStrategy));
    const forecast = predictor.predict(readings, settings.forecastHorizonDays);
    const predictedByDate = new Map(forecast.historical.map((p) => [p.date, p.predictedLiters]));

    const detector = new LeakDetector({
      spikePercentThreshold: settings.spikePercentThreshold,
      highRiskPercentThreshold: settings.highRiskPercentThreshold,
      nightFlowThresholdLph: settings.nightFlowThresholdLph,
      consecutiveAbnormalDays: settings.consecutiveAbnormalDays,
      historicalZThreshold: settings.historicalZThreshold,
    });

    const observer = new SqliteAlertObserver();
    detector.attach(observer);
    detector.analyzeReadings(userId, readings, predictedByDate);

    // Preserve user's acknowledged/resolved decisions keyed by (date + ruleTriggered)
    const existingRows = this.db
      .prepare('SELECT id, date, rule_triggered, status FROM alerts WHERE user_id = ?')
      .all(userId) as Array<{ id: number; date: string; rule_triggered: string; status: AlertStatus }>;

    const statusMap = new Map<string, AlertStatus>();
    for (const row of existingRows) {
      statusMap.set(`${row.date}::${row.rule_triggered}`, row.status);
    }

    this.db.prepare('DELETE FROM alerts WHERE user_id = ?').run(userId);

    const insertAlert = this.db.prepare(
      `INSERT INTO alerts (
        user_id, date, risk_level, rule_triggered, reason,
        expected_liters, actual_liters, night_flow_lph, recommended_action, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );

    for (const alert of observer.detected) {
      const priorStatus = statusMap.get(`${alert.date}::${alert.ruleTriggered}`) ?? 'Active';
      insertAlert.run(
        userId,
        alert.date,
        alert.riskLevel,
        alert.ruleTriggered,
        alert.reason,
        alert.expectedLiters,
        alert.actualLiters,
        alert.nightFlowLph,
        alert.recommendedAction,
        priorStatus
      );
    }
  }

  public getAlertsForUser(userId: number): AlertProps[] {
    const rows = this.db
      .prepare('SELECT * FROM alerts WHERE user_id = ? ORDER BY date DESC, id DESC')
      .all(userId) as Array<{
      id: number;
      user_id: number;
      date: string;
      risk_level: Alert['riskLevel'];
      rule_triggered: string;
      reason: string;
      expected_liters: number;
      actual_liters: number;
      night_flow_lph: number;
      recommended_action: string;
      status: AlertStatus;
      created_at: string;
    }>;

    return rows.map((r) =>
      new Alert({
        id: r.id,
        userId: r.user_id,
        date: r.date,
        riskLevel: r.risk_level,
        ruleTriggered: r.rule_triggered,
        reason: r.reason,
        expectedLiters: r.expected_liters,
        actualLiters: r.actual_liters,
        nightFlowLph: r.night_flow_lph,
        recommendedAction: r.recommended_action,
        status: r.status,
        createdAt: r.created_at,
      }).toJSON()
    );
  }

  public updateAlertStatus(userId: number, alertId: number, status: AlertStatus): AlertProps | null {
    const res = this.db
      .prepare('UPDATE alerts SET status = ? WHERE id = ? AND user_id = ?')
      .run(status, alertId, userId);

    if (res.changes === 0) return null;
    const all = this.getAlertsForUser(userId);
    return all.find((a) => a.id === alertId) ?? null;
  }

  public getConservationGoal(userId: number): ConservationGoalProps {
    const row = this.db
      .prepare('SELECT * FROM conservation_goals WHERE user_id = ?')
      .get(userId) as
      | {
          id: number;
          user_id: number;
          daily_target_liters: number;
          monthly_limit_liters: number;
          baseline_daily_liters: number;
          action_start_date: string;
          action_label: string;
        }
      | undefined;

    if (!row) {
      return {
        userId,
        dailyTargetLiters: 300,
        monthlyLimitLiters: 9000,
        baselineDailyLiters: 340,
        actionStartDate: addDaysISO(getTodayISO(), -14),
        actionLabel: 'Daily conservation goal',
      };
    }

    return {
      id: row.id,
      userId: row.user_id,
      dailyTargetLiters: row.daily_target_liters,
      monthlyLimitLiters: row.monthly_limit_liters,
      baselineDailyLiters: row.baseline_daily_liters,
      actionStartDate: row.action_start_date,
      actionLabel: row.action_label,
    };
  }

  public updateConservationGoal(userId: number, goal: ConservationGoalProps): ConservationGoalProps {
    const validation = ConservationManager.validateGoal(goal);
    if (!validation.valid) {
      throw new Error(validation.errors.join(' '));
    }

    this.db
      .prepare(
        `INSERT INTO conservation_goals (
          user_id, daily_target_liters, monthly_limit_liters, baseline_daily_liters, action_start_date, action_label, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
        ON CONFLICT(user_id) DO UPDATE SET
          daily_target_liters = excluded.daily_target_liters,
          monthly_limit_liters = excluded.monthly_limit_liters,
          baseline_daily_liters = excluded.baseline_daily_liters,
          action_start_date = excluded.action_start_date,
          action_label = excluded.action_label,
          updated_at = datetime('now')`
      )
      .run(
        userId,
        Number(goal.dailyTargetLiters),
        Number(goal.monthlyLimitLiters),
        Number(goal.baselineDailyLiters),
        goal.actionStartDate,
        goal.actionLabel.trim()
      );

    return this.getConservationGoal(userId);
  }

  public getWorkspacePayload(
    userId: number,
    overrideStrategy?: ForecastMethodKey,
    overrideHorizon?: number
  ): WorkspacePayload {
    const user = this.getUserById(userId);
    if (!user) throw new Error('User not found.');

    const readings = this.getReadingsForUser(userId);
    const settings = this.getUserSettings(userId);
    const strategyKey = overrideStrategy ?? settings.forecastStrategy;
    const horizon = overrideHorizon ?? settings.forecastHorizonDays;

    const sensor = new FlowSensor(`FS-${user.getMeterId()}`);
    const meter = new WaterMeter(user.getMeterId(), user.id, sensor, readings);

    const predictor = new UsagePredictor(UsagePredictor.createStrategy(strategyKey));
    const forecast = predictor.predict(readings, horizon);

    const alerts = this.getAlertsForUser(userId);
    const activeAlerts = alerts.filter((a) => a.status === 'Active');
    const latestCutoff =
      readings.length > 0 ? readings[Math.max(0, readings.length - 14)].date : '';
    const recentActive = activeAlerts.filter((a) => a.date >= latestCutoff);

    let overallRiskLevel: LeakAnalysisResult['overallRiskLevel'] = 'Normal';
    if (recentActive.some((a) => a.riskLevel === 'High Risk')) {
      overallRiskLevel = 'High Risk';
    } else if (recentActive.some((a) => a.riskLevel === 'Medium Risk')) {
      overallRiskLevel = 'Medium Risk';
    } else if (recentActive.some((a) => a.riskLevel === 'Low Risk')) {
      overallRiskLevel = 'Low Risk';
    }

    const goal = this.getConservationGoal(userId);
    const conservationManager = new ConservationManager();
    const conservation = conservationManager.evaluateProgress(readings, goal);

    return {
      user: user.toPublicJSON(),
      meterId: user.getMeterId(),
      sensorInfo: {
        sensorId: sensor.sensorId,
        location: sensor.location,
        pipeDiameterMm: sensor.pipeDiameterMm,
        unit: sensor.unit,
      },
      settings,
      summary: meter.getSummaryMetrics(),
      readings: readings.map((r) => r.toJSON()),
      weekly: meter.getWeeklyAggregation(),
      monthly: meter.getMonthlyAggregation(),
      forecast,
      leakAnalysis: {
        overallRiskLevel,
        activeAlertsCount: activeAlerts.length,
        lastAnalyzedDate: readings.length > 0 ? readings[readings.length - 1].date : null,
      },
      alerts,
      conservation,
    };
  }
}
