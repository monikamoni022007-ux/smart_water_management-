import test from 'node:test';
import assert from 'node:assert/strict';
import { Reading } from './Reading';
import { FlowSensor } from './Sensor';
import { WaterMeter } from './WaterMeter';
import { LinearRegressionForecaster, MovingAverageForecaster } from './Forecaster';
import { UsagePredictor } from './UsagePredictor';
import { Alert, AlertObserver } from './Alert';
import { LeakDetector } from './LeakDetector';
import { ConservationManager } from './ConservationManager';
import { generateDeterministicDemoDataset } from './DemoData';

test('Reading validation rejects empty, negative, or out-of-range inputs', () => {
  const bad1 = Reading.validateInput({ date: 'invalid', volumeLiters: -10, nightFlowLph: 2 });
  assert.equal(bad1.valid, false);
  assert.ok(bad1.errors.length >= 2);

  const bad2 = Reading.validateInput({ date: '2026-11-18', volumeLiters: 0, nightFlowLph: -1 });
  assert.equal(bad2.valid, false);

  const good = Reading.validateInput({ date: '2026-11-18', volumeLiters: 310, nightFlowLph: 2.5 });
  assert.equal(good.valid, true);
});

test('WaterMeter and FlowSensor capture readings and compute aggregations', () => {
  const sensor = new FlowSensor('FS-TEST', 'Main Pipe', 25, 2500);
  const meter = new WaterMeter('WM-0001', 1, sensor);

  meter.recordUsage({ id: 1, date: '2026-11-10', volumeLiters: 300, nightFlowLph: 2, source: 'manual' });
  meter.recordUsage({ id: 2, date: '2026-11-11', volumeLiters: 320, nightFlowLph: 3, source: 'manual' });
  meter.recordUsage({ id: 3, date: '2026-11-14', volumeLiters: 360, nightFlowLph: 2.5, source: 'manual' }); // Saturday

  const metrics = meter.getSummaryMetrics();
  assert.equal(metrics.totalReadings, 3);
  assert.equal(metrics.todayLiters, 360);
  assert.equal(metrics.totalVolumeLiters, 980);
  assert.equal(metrics.weekdayAverageLiters, 310);
  assert.equal(metrics.weekendAverageLiters, 360);
  assert.equal(meter.getMonthlyAggregation().length, 1);
  assert.equal(meter.getWeeklyAggregation().length, 1);
});

test('Demo dataset is 92 days long and strictly deterministic', () => {
  const d1 = generateDeterministicDemoDataset('2026-11-18');
  const d2 = generateDeterministicDemoDataset('2026-11-18');
  assert.equal(d1.length, 92);
  assert.deepEqual(d1, d2);
  assert.equal(d1[d1.length - 1].date, '2026-11-18');
});

test('UsagePredictor switches strategies via Strategy Pattern', () => {
  const raw = generateDeterministicDemoDataset('2026-11-18');
  const readings = raw.map(
    (r, idx) =>
      new Reading({
        id: idx + 1,
        userId: 1,
        meterId: 'WM-0001',
        date: r.date,
        volumeLiters: r.volumeLiters,
        nightFlowLph: r.nightFlowLph,
        source: 'demo',
        notes: r.notes ?? '',
      })
  );

  const predictor = new UsagePredictor(new LinearRegressionForecaster());
  const lrResult = predictor.predict(readings, 14);
  assert.equal(lrResult.methodKey, 'linear_regression');
  assert.equal(lrResult.future.length, 14);
  assert.equal(lrResult.historical.length, 92);
  assert.ok(lrResult.nextDayPredictedLiters > 150 && lrResult.nextDayPredictedLiters < 600);

  predictor.setStrategy(new MovingAverageForecaster(7));
  const maResult = predictor.predict(readings, 7);
  assert.equal(maResult.methodKey, 'moving_average');
  assert.equal(maResult.future.length, 7);
  assert.notEqual(lrResult.nextDayPredictedLiters, maResult.nextDayPredictedLiters);
});

test('LeakDetector notifies Observer and categorizes Possible Leak risk levels', () => {
  const raw = generateDeterministicDemoDataset('2026-11-18');
  const readings = raw.map(
    (r, idx) =>
      new Reading({
        id: idx + 1,
        userId: 1,
        meterId: 'WM-0001',
        date: r.date,
        volumeLiters: r.volumeLiters,
        nightFlowLph: r.nightFlowLph,
        source: 'demo',
        notes: r.notes ?? '',
      })
  );

  const predictor = new UsagePredictor(new LinearRegressionForecaster());
  const forecast = predictor.predict(readings, 7);
  const predMap = new Map(forecast.historical.map((h) => [h.date, h.predictedLiters]));

  const observed: Alert[] = [];
  const spyObserver: AlertObserver = {
    update(alert: Alert) {
      observed.push(alert);
    },
  };

  const detector = new LeakDetector();
  detector.attach(spyObserver);
  const analysis = detector.analyzeReadings(1, readings, predMap);

  assert.ok(observed.length >= 4, 'Expected at least 4 suspected leak alerts from demo anomaly windows');
  assert.ok(observed.some((a) => a.riskLevel === 'High Risk'));
  assert.ok(observed.every((a) => a.reason.includes('Possible Leak') || a.reason.includes('Suspected Leak')));
  assert.notEqual(analysis.overallRiskLevel, 'Normal');
});

test('ConservationManager evaluates goal progress and before/after savings', () => {
  const raw = generateDeterministicDemoDataset('2026-11-18');
  const readings = raw.map(
    (r, idx) =>
      new Reading({
        id: idx + 1,
        userId: 1,
        meterId: 'WM-0001',
        date: r.date,
        volumeLiters: r.volumeLiters,
        nightFlowLph: r.nightFlowLph,
        source: 'demo',
        notes: r.notes ?? '',
      })
  );

  const manager = new ConservationManager();
  const progress = manager.evaluateProgress(readings, {
    userId: 1,
    dailyTargetLiters: 315,
    monthlyLimitLiters: 9600,
    baselineDailyLiters: 335,
    actionStartDate: '2026-10-28',
    actionLabel: 'Installed low-flow aerators and fixed cistern seal',
  });

  assert.ok(progress.beforeAvgLiters > progress.afterAvgLiters);
  assert.ok(progress.estimatedDailySavingsLiters > 0);
  assert.ok(progress.recommendations.length >= 1);
});

test('ConservationManager returns zero savings when readings list is empty', () => {
  const manager = new ConservationManager();
  const emptyProgress = manager.evaluateProgress([], {
    userId: 1,
    dailyTargetLiters: 310,
    monthlyLimitLiters: 9400,
    baselineDailyLiters: 342,
    actionStartDate: '2026-10-28',
    actionLabel: 'Baseline check',
  });

  assert.equal(emptyProgress.beforeAvgLiters, 0);
  assert.equal(emptyProgress.afterAvgLiters, 0);
  assert.equal(emptyProgress.estimatedDailySavingsLiters, 0);
  assert.equal(emptyProgress.estimatedTotalSavedLiters, 0);
  assert.equal(emptyProgress.savingsPercent, 0);
});
