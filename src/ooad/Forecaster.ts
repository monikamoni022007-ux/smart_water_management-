import { Reading } from './Reading';

export type ForecastMethodKey = 'linear_regression' | 'moving_average';

export interface HistoricalComparisonPoint {
  date: string;
  actualLiters: number;
  predictedLiters: number;
  deviationLiters: number;
  deviationPercent: number;
  source: 'demo' | 'manual';
}

export interface FutureForecastPoint {
  date: string;
  predictedLiters: number;
  lowerBoundLiters: number;
  upperBoundLiters: number;
}

export interface ForecastResult {
  methodKey: ForecastMethodKey;
  methodName: string;
  explanation: string;
  formulaSummary: string;
  historical: HistoricalComparisonPoint[];
  future: FutureForecastPoint[];
  nextDayPredictedLiters: number;
  horizonTotalPredictedLiters: number;
  maeLiters: number;
  rmseLiters: number;
  slopeLitersPerDay: number;
  rSquared: number | null;
}

export interface Forecaster {
  readonly methodKey: ForecastMethodKey;
  readonly name: string;
  explain(): string;
  fitAndPredict(readings: Reading[], horizonDays: number): ForecastResult;
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function computeErrors(points: HistoricalComparisonPoint[]): { mae: number; rmse: number } {
  if (points.length === 0) return { mae: 0, rmse: 0 };
  let absSum = 0;
  let sqSum = 0;
  for (const p of points) {
    const err = Math.abs(p.actualLiters - p.predictedLiters);
    absSum += err;
    sqSum += err * err;
  }
  return {
    mae: Number((absSum / points.length).toFixed(1)),
    rmse: Number(Math.sqrt(sqSum / points.length).toFixed(1)),
  };
}

/**
 * Ordinary Least Squares Linear Regression with Day-of-Week Seasonal Adjustment.
 * Fits y = m*x + b over chronological day index x, then applies observed weekday/weekend factor
 * so forecasts reflect both long-term trend and weekly household cadence.
 */
export class LinearRegressionForecaster implements Forecaster {
  public readonly methodKey: ForecastMethodKey = 'linear_regression';
  public readonly name = 'Linear Regression (OLS + Weekly Seasonality)';

  public explain(): string {
    return (
      'Fits an Ordinary Least Squares (OLS) trend line y = m·x + b across chronological daily readings ' +
      'using recent weighted history, then applies day-of-week seasonal multipliers computed from your ' +
      'historical weekday versus weekend consumption.'
    );
  }

  public fitAndPredict(readings: Reading[], horizonDays: number): ForecastResult {
    const sorted = [...readings].sort((a, b) => a.date.localeCompare(b.date));
    if (sorted.length === 0) {
      return {
        methodKey: this.methodKey,
        methodName: this.name,
        explanation: this.explain(),
        formulaSummary: 'Insufficient readings to fit regression model.',
        historical: [],
        future: [],
        nextDayPredictedLiters: 0,
        horizonTotalPredictedLiters: 0,
        maeLiters: 0,
        rmseLiters: 0,
        slopeLitersPerDay: 0,
        rSquared: null,
      };
    }

    if (sorted.length === 1) {
      const only = sorted[0];
      const historical: HistoricalComparisonPoint[] = [
        {
          date: only.date,
          actualLiters: only.volumeLiters,
          predictedLiters: only.volumeLiters,
          deviationLiters: 0,
          deviationPercent: 0,
          source: only.source,
        },
      ];
      const future: FutureForecastPoint[] = Array.from({ length: horizonDays }, (_, i) => ({
        date: addDays(only.date, i + 1),
        predictedLiters: only.volumeLiters,
        lowerBoundLiters: Number((only.volumeLiters * 0.9).toFixed(1)),
        upperBoundLiters: Number((only.volumeLiters * 1.1).toFixed(1)),
      }));
      return {
        methodKey: this.methodKey,
        methodName: this.name,
        explanation: this.explain(),
        formulaSummary: `y = ${only.volumeLiters.toFixed(1)} L (single baseline reading)`,
        historical,
        future,
        nextDayPredictedLiters: only.volumeLiters,
        horizonTotalPredictedLiters: Number((only.volumeLiters * horizonDays).toFixed(1)),
        maeLiters: 0,
        rmseLiters: 0,
        slopeLitersPerDay: 0,
        rSquared: null,
      };
    }

    // Use robust trimmed/winsorized values when fitting the baseline line so extreme leak spikes
    // do not artificially pull the expected baseline upward and mask future leaks.
    const vols = sorted.map((r) => r.volumeLiters);
    const sortedVols = [...vols].sort((a, b) => a - b);
    const q1 = sortedVols[Math.floor(sortedVols.length * 0.25)];
    const q3 = sortedVols[Math.floor(sortedVols.length * 0.75)];
    const iqr = Math.max(q3 - q1, 1);
    const upperFence = q3 + 1.5 * iqr;

    const n = sorted.length;
    const xValues = sorted.map((_, idx) => idx);
    const yFit = sorted.map((r) => Math.min(r.volumeLiters, upperFence));

    const meanX = xValues.reduce((s, x) => s + x, 0) / n;
    const meanY = yFit.reduce((s, y) => s + y, 0) / n;

    let numerator = 0;
    let denominator = 0;
    for (let i = 0; i < n; i++) {
      const dx = xValues[i] - meanX;
      numerator += dx * (yFit[i] - meanY);
      denominator += dx * dx;
    }

    const slope = denominator === 0 ? 0 : numerator / denominator;
    const intercept = meanY - slope * meanX;

    // Day-of-week seasonal ratios relative to trend line
    const dowBuckets: number[][] = Array.from({ length: 7 }, () => []);
    for (let i = 0; i < n; i++) {
      const base = Math.max(intercept + slope * i, 1);
      const dow = sorted[i].getDayOfWeek();
      dowBuckets[dow].push(yFit[i] / base);
    }
    const dowFactor = dowBuckets.map((bucket) => {
      if (bucket.length === 0) return 1;
      const avg = bucket.reduce((a, b) => a + b, 0) / bucket.length;
      return Math.min(Math.max(avg, 0.8), 1.25);
    });

    const historical: HistoricalComparisonPoint[] = sorted.map((r, idx) => {
      const trendVal = Math.max(intercept + slope * idx, 10);
      const predicted = Number((trendVal * dowFactor[r.getDayOfWeek()]).toFixed(1));
      const deviationLiters = Number((r.volumeLiters - predicted).toFixed(1));
      const deviationPercent = predicted > 0 ? Number(((deviationLiters / predicted) * 100).toFixed(1)) : 0;
      return {
        date: r.date,
        actualLiters: r.volumeLiters,
        predictedLiters: predicted,
        deviationLiters,
        deviationPercent,
        source: r.source,
      };
    });

    const { mae, rmse } = computeErrors(historical);

    // R^2 on robust baseline
    let ssTot = 0;
    let ssRes = 0;
    for (let i = 0; i < n; i++) {
      const pred = Math.max(intercept + slope * i, 10) * dowFactor[sorted[i].getDayOfWeek()];
      ssTot += Math.pow(yFit[i] - meanY, 2);
      ssRes += Math.pow(yFit[i] - pred, 2);
    }
    const rSquared = ssTot > 0 ? Number(Math.max(0, 1 - ssRes / ssTot).toFixed(3)) : null;

    const lastDate = sorted[n - 1].date;
    const bandWidth = Math.max(rmse * 1.28, meanY * 0.08);
    const future: FutureForecastPoint[] = [];
    for (let step = 1; step <= horizonDays; step++) {
      const futureDate = addDays(lastDate, step);
      const dow = new Date(`${futureDate}T12:00:00Z`).getUTCDay();
      const trendVal = Math.max(intercept + slope * (n - 1 + step), 20);
      const predicted = Number((trendVal * dowFactor[dow]).toFixed(1));
      future.push({
        date: futureDate,
        predictedLiters: predicted,
        lowerBoundLiters: Number(Math.max(0, predicted - bandWidth).toFixed(1)),
        upperBoundLiters: Number((predicted + bandWidth).toFixed(1)),
      });
    }

    const nextDay = future[0]?.predictedLiters ?? 0;
    const horizonTotal = Number(future.reduce((s, p) => s + p.predictedLiters, 0).toFixed(1));

    return {
      methodKey: this.methodKey,
      methodName: this.name,
      explanation: this.explain(),
      formulaSummary: `y = (${slope >= 0 ? '+' : ''}${slope.toFixed(2)} · dayIndex + ${intercept.toFixed(1)}) × DOW_Factor`,
      historical,
      future,
      nextDayPredictedLiters: nextDay,
      horizonTotalPredictedLiters: horizonTotal,
      maeLiters: mae,
      rmseLiters: rmse,
      slopeLitersPerDay: Number(slope.toFixed(2)),
      rSquared,
    };
  }
}

/**
 * 7-Day Trailing Moving Average Forecaster with Weekend Offset.
 * Smooths short-term spikes by averaging the prior N normal-weighted days.
 */
export class MovingAverageForecaster implements Forecaster {
  public readonly methodKey: ForecastMethodKey = 'moving_average';
  public readonly name: string;
  private readonly windowSize: number;

  constructor(windowSize = 7) {
    this.windowSize = windowSize;
    this.name = `${windowSize}-Day Moving Average`;
  }

  public explain(): string {
    return (
      `Computes the rolling ${this.windowSize}-day average of preceding water consumption ` +
      'with linear weights favoring the most recent days and outlier dampening so isolated spikes ' +
      'do not distort expected daily demand.'
    );
  }

  public fitAndPredict(readings: Reading[], horizonDays: number): ForecastResult {
    const sorted = [...readings].sort((a, b) => a.date.localeCompare(b.date));
    if (sorted.length === 0) {
      return {
        methodKey: this.methodKey,
        methodName: this.name,
        explanation: this.explain(),
        formulaSummary: 'Insufficient readings for moving average.',
        historical: [],
        future: [],
        nextDayPredictedLiters: 0,
        horizonTotalPredictedLiters: 0,
        maeLiters: 0,
        rmseLiters: 0,
        slopeLitersPerDay: 0,
        rSquared: null,
      };
    }

    const vols = sorted.map((r) => r.volumeLiters);
    const median = [...vols].sort((a, b) => a - b)[Math.floor(vols.length / 2)];
    const dampened = vols.map((v) => (v > median * 1.45 ? median * 1.25 : v));

    const historical: HistoricalComparisonPoint[] = sorted.map((r, idx) => {
      let predicted: number;
      if (idx === 0) {
        predicted = r.volumeLiters;
      } else {
        const start = Math.max(0, idx - this.windowSize);
        const window = dampened.slice(start, idx);
        let weightedSum = 0;
        let weightTotal = 0;
        for (let j = 0; j < window.length; j++) {
          const w = j + 1;
          weightedSum += window[j] * w;
          weightTotal += w;
        }
        predicted = Number((weightedSum / weightTotal).toFixed(1));
      }
      const deviationLiters = Number((r.volumeLiters - predicted).toFixed(1));
      const deviationPercent = predicted > 0 ? Number(((deviationLiters / predicted) * 100).toFixed(1)) : 0;
      return {
        date: r.date,
        actualLiters: r.volumeLiters,
        predictedLiters: predicted,
        deviationLiters,
        deviationPercent,
        source: r.source,
      };
    });

    const { mae, rmse } = computeErrors(historical);
    const tailWindow = dampened.slice(-this.windowSize);
    let tailWeighted = 0;
    let tailW = 0;
    for (let j = 0; j < tailWindow.length; j++) {
      const w = j + 1;
      tailWeighted += tailWindow[j] * w;
      tailW += w;
    }
    const baseNext = tailW > 0 ? tailWeighted / tailW : sorted[sorted.length - 1].volumeLiters;

    // Small drift estimate between prior window and current window
    const prevWindow = dampened.slice(-this.windowSize * 2, -this.windowSize);
    const prevAvg =
      prevWindow.length > 0 ? prevWindow.reduce((a, b) => a + b, 0) / prevWindow.length : baseNext;
    const recentAvg = tailWindow.reduce((a, b) => a + b, 0) / tailWindow.length;
    const dailyDrift = Number(((recentAvg - prevAvg) / this.windowSize).toFixed(2));

    const lastDate = sorted[sorted.length - 1].date;
    const bandWidth = Math.max(rmse * 1.28, baseNext * 0.08);
    const future: FutureForecastPoint[] = [];
    for (let step = 1; step <= horizonDays; step++) {
      const predicted = Number(Math.max(20, baseNext + dailyDrift * step * 0.35).toFixed(1));
      future.push({
        date: addDays(lastDate, step),
        predictedLiters: predicted,
        lowerBoundLiters: Number(Math.max(0, predicted - bandWidth).toFixed(1)),
        upperBoundLiters: Number((predicted + bandWidth).toFixed(1)),
      });
    }

    return {
      methodKey: this.methodKey,
      methodName: this.name,
      explanation: this.explain(),
      formulaSummary: `MA_${this.windowSize}(t) = Σ(w_i · y_{t-i}) / Σw_i (base = ${baseNext.toFixed(1)} L/day)`,
      historical,
      future,
      nextDayPredictedLiters: future[0]?.predictedLiters ?? 0,
      horizonTotalPredictedLiters: Number(future.reduce((s, p) => s + p.predictedLiters, 0).toFixed(1)),
      maeLiters: mae,
      rmseLiters: rmse,
      slopeLitersPerDay: dailyDrift,
      rSquared: null,
    };
  }
}
