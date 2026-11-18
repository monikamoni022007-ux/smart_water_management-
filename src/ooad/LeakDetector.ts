import { Alert, AlertObserver, AlertRiskLevel } from './Alert';
import { Reading } from './Reading';

export interface LeakThresholds {
  spikePercentThreshold: number;
  highRiskPercentThreshold: number;
  nightFlowThresholdLph: number;
  consecutiveAbnormalDays: number;
  historicalZThreshold: number;
}

export const DEFAULT_LEAK_THRESHOLDS: LeakThresholds = {
  spikePercentThreshold: 30,
  highRiskPercentThreshold: 60,
  nightFlowThresholdLph: 12,
  consecutiveAbnormalDays: 2,
  historicalZThreshold: 2.0,
};

export interface LeakAnalysisResult {
  overallRiskLevel: AlertRiskLevel;
  activeAlertsCount: number;
  generatedAlerts: Alert[];
  lastAnalyzedDate: string | null;
}

export class AlertCollectorObserver implements AlertObserver {
  public readonly collected: Alert[] = [];

  public update(alert: Alert): void {
    this.collected.push(alert);
  }
}

/**
 * Subject (Observable) in the Observer Pattern.
 * Evaluates historical/recent readings for Possible Leak patterns and notifies attached AlertObservers.
 */
export class LeakDetector {
  private observers: AlertObserver[] = [];
  private thresholds: LeakThresholds;

  constructor(thresholds: Partial<LeakThresholds> = {}) {
    this.thresholds = { ...DEFAULT_LEAK_THRESHOLDS, ...thresholds };
  }

  public getThresholds(): LeakThresholds {
    return { ...this.thresholds };
  }

  public updateThresholds(next: Partial<LeakThresholds>): void {
    this.thresholds = { ...this.thresholds, ...next };
  }

  public attach(observer: AlertObserver): void {
    if (!this.observers.includes(observer)) {
      this.observers.push(observer);
    }
  }

  public detach(observer: AlertObserver): void {
    this.observers = this.observers.filter((o) => o !== observer);
  }

  public notify(alert: Alert): void {
    for (const observer of this.observers) {
      observer.update(alert);
    }
  }

  public analyzeReadings(
    userId: number,
    readings: Reading[],
    predictedByDate: Map<string, number>
  ): LeakAnalysisResult {
    const sorted = [...readings].sort((a, b) => a.date.localeCompare(b.date));
    if (sorted.length === 0) {
      return {
        overallRiskLevel: 'Normal',
        activeAlertsCount: 0,
        generatedAlerts: [],
        lastAnalyzedDate: null,
      };
    }

    const collector = new AlertCollectorObserver();
    this.attach(collector);

    // Compute robust baseline mean and std dev (excluding extreme upper 10% tail)
    const vols = sorted.map((r) => r.volumeLiters).sort((a, b) => a - b);
    const cutoffIdx = Math.max(1, Math.floor(vols.length * 0.9));
    const trimmed = vols.slice(0, cutoffIdx);
    const baselineMean = trimmed.reduce((s, v) => s + v, 0) / trimmed.length;
    const baselineVariance =
      trimmed.reduce((s, v) => s + Math.pow(v - baselineMean, 2), 0) / trimmed.length;
    const baselineStd = Math.max(Math.sqrt(baselineVariance), 20);

    let consecutiveElevated = 0;

    for (let i = 0; i < sorted.length; i++) {
      const r = sorted[i];
      const expected = predictedByDate.get(r.date) ?? Number(baselineMean.toFixed(1));
      const deviationPct = expected > 0 ? ((r.volumeLiters - expected) / expected) * 100 : 0;
      const zScore = (r.volumeLiters - baselineMean) / baselineStd;

      const isNightFlowElevated = r.nightFlowLph >= this.thresholds.nightFlowThresholdLph;
      const isNightFlowSevere = r.nightFlowLph >= this.thresholds.nightFlowThresholdLph * 1.6;
      const isSpikeExceeded = deviationPct >= this.thresholds.spikePercentThreshold;
      const isHighSpike = deviationPct >= this.thresholds.highRiskPercentThreshold;
      const isStatisticalOutlier = sorted.length >= 7 && zScore >= this.thresholds.historicalZThreshold;

      if (isSpikeExceeded || isNightFlowElevated || isStatisticalOutlier) {
        consecutiveElevated += 1;
      } else {
        consecutiveElevated = 0;
      }

      const isConsecutivePattern = consecutiveElevated >= this.thresholds.consecutiveAbnormalDays;

      if (!isSpikeExceeded && !isNightFlowElevated && !isStatisticalOutlier && !isConsecutivePattern) {
        continue;
      }

      const triggeredRules: string[] = [];
      const reasons: string[] = [];

      if (isSpikeExceeded) {
        triggeredRules.push('Expected vs Actual Surge');
        reasons.push(
          `Possible Leak: daily usage of ${r.volumeLiters.toFixed(0)} L exceeded expected ${expected.toFixed(0)} L by ${deviationPct.toFixed(1)}% (threshold ${this.thresholds.spikePercentThreshold}%).`
        );
      }

      if (isNightFlowElevated) {
        triggeredRules.push('Continuous Nighttime Flow');
        reasons.push(
          `Suspected Leak: simulated continuous nighttime flow reached ${r.nightFlowLph.toFixed(1)} L/h (threshold ${this.thresholds.nightFlowThresholdLph} L/h), indicating unmetered trickle when fixtures should be idle.`
        );
      }

      if (isConsecutivePattern) {
        triggeredRules.push('Multi-Period Sustained Elevation');
        reasons.push(
          `Possible Leak: abnormal elevation persisted across ${consecutiveElevated} consecutive daily periods.`
        );
      }

      if (isStatisticalOutlier && !isSpikeExceeded) {
        triggeredRules.push('Historical Variance Outlier');
        reasons.push(
          `Suspected Leak: reading sits ${zScore.toFixed(1)}σ above historical baseline (${baselineMean.toFixed(0)} L/day).`
        );
      }

      let riskLevel: AlertRiskLevel = 'Low Risk';
      if (
        isHighSpike ||
        isNightFlowSevere ||
        (isSpikeExceeded && isNightFlowElevated) ||
        (isConsecutivePattern && (isSpikeExceeded || isNightFlowElevated))
      ) {
        riskLevel =
          isHighSpike || isNightFlowSevere || (isConsecutivePattern && isNightFlowElevated && isSpikeExceeded)
            ? 'High Risk'
            : 'Medium Risk';
      } else if (isNightFlowElevated || isSpikeExceeded) {
        riskLevel = 'Medium Risk';
      }

      const recommendedAction = isNightFlowElevated
        ? 'Inspect toilet cistern flapper valves, shut off all taps overnight, and compare meter reading before sleep and at dawn.'
        : isHighSpike
        ? 'Check garden irrigation timers, pressurized supply lines, and water heater relief valves for possible burst or stuck valve.'
        : 'Monitor the next 24-hour reading and inspect visible plumbing joints and under-sink traps for dampness.';

      const alert = new Alert({
        id: 0,
        userId,
        date: r.date,
        riskLevel,
        ruleTriggered: triggeredRules.join(' + '),
        reason: reasons.join(' '),
        expectedLiters: Number(expected.toFixed(1)),
        actualLiters: Number(r.volumeLiters.toFixed(1)),
        nightFlowLph: Number(r.nightFlowLph.toFixed(1)),
        recommendedAction,
        status: 'Active',
      });

      this.notify(alert);
    }

    this.detach(collector);

    const recentWindowStart = sorted[Math.max(0, sorted.length - 14)].date;
    const recentAlerts = collector.collected.filter((a) => a.date >= recentWindowStart);

    let overallRiskLevel: AlertRiskLevel = 'Normal';
    if (recentAlerts.some((a) => a.riskLevel === 'High Risk')) {
      overallRiskLevel = 'High Risk';
    } else if (recentAlerts.some((a) => a.riskLevel === 'Medium Risk')) {
      overallRiskLevel = 'Medium Risk';
    } else if (recentAlerts.some((a) => a.riskLevel === 'Low Risk')) {
      overallRiskLevel = 'Low Risk';
    }

    return {
      overallRiskLevel,
      activeAlertsCount: collector.collected.length,
      generatedAlerts: collector.collected,
      lastAnalyzedDate: sorted[sorted.length - 1].date,
    };
  }
}
