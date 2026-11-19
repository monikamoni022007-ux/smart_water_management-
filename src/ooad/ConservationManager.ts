import { Reading } from './Reading';

export interface ConservationGoalProps {
  id?: number;
  userId: number;
  dailyTargetLiters: number;
  monthlyLimitLiters: number;
  baselineDailyLiters: number;
  actionStartDate: string;
  actionLabel: string;
}

export interface ConservationRecommendation {
  id: string;
  title: string;
  category: 'Fixture' | 'Behavior' | 'Night Flow' | 'Outdoor';
  estimatedDailySavingsLiters: number;
  rationale: string;
}

export interface ConservationProgress {
  goal: ConservationGoalProps;
  currentAvgDailyLiters: number;
  recentThirtyDayTotalLiters: number;
  monthlyLimitRemainingLiters: number;
  monthlyLimitUtilizationPercent: number;
  daysWithinDailyTarget: number;
  totalEvaluatedDays: number;
  targetAdherencePercent: number;
  beforeAvgLiters: number;
  afterAvgLiters: number;
  estimatedDailySavingsLiters: number;
  estimatedTotalSavedLiters: number;
  savingsPercent: number;
  statusLabel: 'On Track' | 'Needs Attention' | 'Over Limit';
  recommendations: ConservationRecommendation[];
}

export class ConservationManager {
  public static validateGoal(input: Partial<ConservationGoalProps>): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (!input.dailyTargetLiters || Number(input.dailyTargetLiters) < 50 || Number(input.dailyTargetLiters) > 20000) {
      errors.push('Daily target must be between 50 and 20,000 liters.');
    }
    if (!input.monthlyLimitLiters || Number(input.monthlyLimitLiters) < 1000 || Number(input.monthlyLimitLiters) > 600000) {
      errors.push('Monthly limit must be between 1,000 and 600,000 liters.');
    }
    if (!input.baselineDailyLiters || Number(input.baselineDailyLiters) < 50 || Number(input.baselineDailyLiters) > 25000) {
      errors.push('Baseline daily usage must be between 50 and 25,000 liters.');
    }
    if (!input.actionStartDate || !/^\d{4}-\d{2}-\d{2}$/.test(input.actionStartDate)) {
      errors.push('Conservation action start date must be a valid YYYY-MM-DD date.');
    }
    if (!input.actionLabel || input.actionLabel.trim().length < 3) {
      errors.push('Conservation action description must be at least 3 characters.');
    }
    return { valid: errors.length === 0, errors };
  }

  public evaluateProgress(readings: Reading[], goal: ConservationGoalProps): ConservationProgress {
    const sorted = [...readings].sort((a, b) => a.date.localeCompare(b.date));
    const recent30 = sorted.slice(-30);
    const recentThirtyDayTotalLiters = Number(
      recent30.reduce((sum, r) => sum + r.volumeLiters, 0).toFixed(1)
    );
    const currentAvgDailyLiters =
      recent30.length > 0 ? Number((recentThirtyDayTotalLiters / recent30.length).toFixed(1)) : 0;

    const monthlyLimitRemainingLiters = Number(
      (goal.monthlyLimitLiters - recentThirtyDayTotalLiters).toFixed(1)
    );
    const monthlyLimitUtilizationPercent =
      goal.monthlyLimitLiters > 0
        ? Number(((recentThirtyDayTotalLiters / goal.monthlyLimitLiters) * 100).toFixed(1))
        : 0;

    const daysWithinDailyTarget = recent30.filter((r) => r.volumeLiters <= goal.dailyTargetLiters).length;
    const totalEvaluatedDays = recent30.length;
    const targetAdherencePercent =
      totalEvaluatedDays > 0 ? Number(((daysWithinDailyTarget / totalEvaluatedDays) * 100).toFixed(1)) : 0;

    const beforeReadings = sorted.filter((r) => r.date < goal.actionStartDate);
    const afterReadings = sorted.filter((r) => r.date >= goal.actionStartDate);

    const hasReadings = sorted.length > 0;
    const beforeAvgLiters = !hasReadings
      ? 0
      : beforeReadings.length > 0
      ? Number((beforeReadings.reduce((s, r) => s + r.volumeLiters, 0) / beforeReadings.length).toFixed(1))
      : goal.baselineDailyLiters;

    const afterAvgLiters = !hasReadings
      ? 0
      : afterReadings.length > 0
      ? Number((afterReadings.reduce((s, r) => s + r.volumeLiters, 0) / afterReadings.length).toFixed(1))
      : currentAvgDailyLiters;

    const estimatedDailySavingsLiters = hasReadings
      ? Number((beforeAvgLiters - afterAvgLiters).toFixed(1))
      : 0;
    const activePeriodDays = hasReadings ? Math.max(afterReadings.length, recent30.length) : 0;
    const estimatedTotalSavedLiters = hasReadings
      ? Number(Math.max(0, estimatedDailySavingsLiters * activePeriodDays).toFixed(1))
      : 0;
    const savingsPercent =
      hasReadings && beforeAvgLiters > 0
        ? Number(((estimatedDailySavingsLiters / beforeAvgLiters) * 100).toFixed(1))
        : 0;

    let statusLabel: 'On Track' | 'Needs Attention' | 'Over Limit' = 'On Track';
    if (monthlyLimitUtilizationPercent > 100 || currentAvgDailyLiters > goal.dailyTargetLiters * 1.15) {
      statusLabel = 'Over Limit';
    } else if (currentAvgDailyLiters > goal.dailyTargetLiters || targetAdherencePercent < 60) {
      statusLabel = 'Needs Attention';
    }

    const recommendations = this.buildRecommendations(sorted, goal, currentAvgDailyLiters);

    return {
      goal,
      currentAvgDailyLiters,
      recentThirtyDayTotalLiters,
      monthlyLimitRemainingLiters,
      monthlyLimitUtilizationPercent,
      daysWithinDailyTarget,
      totalEvaluatedDays,
      targetAdherencePercent,
      beforeAvgLiters,
      afterAvgLiters,
      estimatedDailySavingsLiters,
      estimatedTotalSavedLiters,
      savingsPercent,
      statusLabel,
      recommendations,
    };
  }

  private buildRecommendations(
    readings: Reading[],
    goal: ConservationGoalProps,
    currentAvg: number
  ): ConservationRecommendation[] {
    const recs: ConservationRecommendation[] = [];
    const avgNightFlow =
      readings.length > 0
        ? readings.reduce((s, r) => s + r.nightFlowLph, 0) / readings.length
        : 0;
    const weekdays = readings.filter((r) => !r.isWeekend());
    const weekends = readings.filter((r) => r.isWeekend());
    const weekdayAvg =
      weekdays.length > 0 ? weekdays.reduce((s, r) => s + r.volumeLiters, 0) / weekdays.length : 0;
    const weekendAvg =
      weekends.length > 0 ? weekends.reduce((s, r) => s + r.volumeLiters, 0) / weekends.length : 0;

    if (avgNightFlow >= 6) {
      recs.push({
        id: 'rec-night-flow',
        title: 'Audit overnight baseline flow and cistern seals',
        category: 'Night Flow',
        estimatedDailySavingsLiters: Number((avgNightFlow * 6).toFixed(0)),
        rationale: `Average nighttime flow is ${avgNightFlow.toFixed(1)} L/h. Eliminating slow toilet flapper seepage saves continuous overnight loss.`,
      });
    }

    if (weekendAvg > weekdayAvg * 1.12 && weekdayAvg > 0) {
      const diff = weekendAvg - weekdayAvg;
      recs.push({
        id: 'rec-weekend',
        title: 'Consolidate weekend laundry and outdoor watering',
        category: 'Outdoor',
        estimatedDailySavingsLiters: Number((diff * 0.45).toFixed(0)),
        rationale: `Weekend usage (${weekendAvg.toFixed(0)} L/day) runs ${(
          ((weekendAvg - weekdayAvg) / weekdayAvg) *
          100
        ).toFixed(0)}% above weekdays. Running full loads and early-morning watering lowers peak demand.`,
      });
    }

    if (currentAvg > goal.dailyTargetLiters) {
      const gap = currentAvg - goal.dailyTargetLiters;
      recs.push({
        id: 'rec-aerators',
        title: 'Install low-flow faucet aerators and 6 L/min showerheads',
        category: 'Fixture',
        estimatedDailySavingsLiters: Number(Math.max(25, gap * 0.6).toFixed(0)),
        rationale: `Current 30-day average (${currentAvg.toFixed(0)} L/day) is ${gap.toFixed(
          0
        )} L above your daily target. Pressure-compensated aerators cut tap flow by 30% without reduced pressure.`,
      });
    }

    recs.push({
      id: 'rec-short-shower',
      title: 'Adopt a 5-minute shower timer and full-load dishwasher schedule',
      category: 'Behavior',
      estimatedDailySavingsLiters: 28,
      rationale:
        'Shaving 2 minutes off daily household showers and running dishwashers only at full capacity preserves ~28 L/day.',
    });

    return recs;
  }
}
