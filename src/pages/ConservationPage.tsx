import { useEffect, useMemo, useState } from 'react';
import { ChartCanvas } from '../components/ChartCanvas';
import { ConservationGoal, WorkspacePayload } from '../types/api';

interface ConservationPageProps {
  workspace: WorkspacePayload;
  onSaveGoal: (goal: Omit<ConservationGoal, 'userId' | 'id'>) => Promise<void>;
}

export function ConservationPage({ workspace, onSaveGoal }: ConservationPageProps) {
  const { conservation } = workspace;
  const { goal } = conservation;

  const [dailyTarget, setDailyTarget] = useState(String(goal.dailyTargetLiters));
  const [monthlyLimit, setMonthlyLimit] = useState(String(goal.monthlyLimitLiters));
  const [baselineDaily, setBaselineDaily] = useState(String(goal.baselineDailyLiters));
  const [actionStartDate, setActionStartDate] = useState(goal.actionStartDate);
  const [actionLabel, setActionLabel] = useState(goal.actionLabel);
  const [formError, setFormError] = useState('');
  const [formSuccess, setFormSuccess] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDailyTarget(String(goal.dailyTargetLiters));
    setMonthlyLimit(String(goal.monthlyLimitLiters));
    setBaselineDaily(String(goal.baselineDailyLiters));
    setActionStartDate(goal.actionStartDate);
    setActionLabel(goal.actionLabel);
  }, [goal]);

  const comparisonChartData = useMemo(
    () => ({
      labels: ['Before Conservation Action', 'After Conservation Action', 'Daily Target'],
      datasets: [
        {
          label: 'Average Liters per Day',
          data: [
            conservation.beforeAvgLiters,
            conservation.afterAvgLiters,
            goal.dailyTargetLiters,
          ],
          backgroundColor: ['#64748B', '#16A34A', '#0284C7'],
          borderRadius: 4,
          barThickness: 44,
        },
      ],
    }),
    [conservation.beforeAvgLiters, conservation.afterAvgLiters, goal.dailyTargetLiters]
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');
    setFormSuccess('');

    const dt = Number(dailyTarget);
    const ml = Number(monthlyLimit);
    const bl = Number(baselineDaily);

    if (Number.isNaN(dt) || dt < 50 || dt > 20000) {
      setFormError('Daily target must be between 50 and 20,000 liters.');
      return;
    }
    if (Number.isNaN(ml) || ml < 1000 || ml > 600000) {
      setFormError('Monthly limit must be between 1,000 and 600,000 liters.');
      return;
    }
    if (Number.isNaN(bl) || bl < 50 || bl > 25000) {
      setFormError('Baseline daily usage must be between 50 and 25,000 liters.');
      return;
    }
    if (!actionStartDate) {
      setFormError('Action start date is required.');
      return;
    }
    if (actionLabel.trim().length < 3) {
      setFormError('Conservation action description must be at least 3 characters.');
      return;
    }

    setSaving(true);
    try {
      await onSaveGoal({
        dailyTargetLiters: dt,
        monthlyLimitLiters: ml,
        baselineDailyLiters: bl,
        actionStartDate,
        actionLabel: actionLabel.trim(),
      });
      setFormSuccess('Conservation targets and before/after benchmark updated.');
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Unable to save conservation target.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* KPI Metrics */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <div className="text-xs font-medium text-slate-500">Estimated Daily Savings</div>
          <div
            className={`font-mono-tabular text-2xl font-semibold mt-1.5 ${
              conservation.estimatedDailySavingsLiters >= 0 ? 'text-[#15803D]' : 'text-[#DC2626]'
            }`}
          >
            {conservation.estimatedDailySavingsLiters >= 0 ? '+' : ''}
            {conservation.estimatedDailySavingsLiters} L/d
          </div>
          <div className="text-xs text-slate-500 mt-1">
            {conservation.savingsPercent >= 0 ? `${conservation.savingsPercent}% reduction` : 'Above pre-action avg'}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <div className="text-xs font-medium text-slate-500">Estimated Total Saved</div>
          <div className="font-mono-tabular text-2xl font-semibold text-[#15803D] mt-1.5">
            {conservation.estimatedTotalSavedLiters.toLocaleString()} L
          </div>
          <div className="text-xs text-slate-500 mt-1">Since {goal.actionStartDate}</div>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <div className="text-xs font-medium text-slate-500">Days Within Daily Target</div>
          <div className="font-mono-tabular text-2xl font-semibold text-[#0F172A] mt-1.5">
            {conservation.daysWithinDailyTarget} / {conservation.totalEvaluatedDays}
          </div>
          <div className="text-xs text-slate-500 mt-1">
            {conservation.targetAdherencePercent}% adherence (last 30 days)
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <div className="text-xs font-medium text-slate-500">Monthly Limit Remaining</div>
          <div
            className={`font-mono-tabular text-2xl font-semibold mt-1.5 ${
              conservation.monthlyLimitRemainingLiters >= 0 ? 'text-[#0F766E]' : 'text-[#DC2626]'
            }`}
          >
            {conservation.monthlyLimitRemainingLiters.toLocaleString()} L
          </div>
          <div className="text-xs text-slate-500 mt-1">
            {conservation.monthlyLimitUtilizationPercent}% of {goal.monthlyLimitLiters.toLocaleString()} L limit used
          </div>
        </div>
      </section>

      {/* Targets Form & Before/After Chart */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-6 bg-white border border-slate-200 rounded-lg p-6">
          <h2 className="font-display text-base font-semibold text-[#0F172A]">
            Conservation Targets & Action Baseline
          </h2>
          <p className="text-xs text-slate-500 mt-0.5 mb-4">
            Set household daily targets, monthly limits, and the date conservation measures began.
          </p>

          {formError && (
            <div className="mb-3 p-3 text-xs text-[#DC2626] bg-red-50 border border-red-200 rounded-md" role="alert">
              {formError}
            </div>
          )}
          {formSuccess && (
            <div className="mb-3 p-3 text-xs text-[#15803D] bg-emerald-50 border border-emerald-200 rounded-md" role="status">
              {formSuccess}
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label htmlFor="goal-daily" className="block text-xs font-medium text-slate-700 mb-1">
                  Daily Target (L)
                </label>
                <input
                  id="goal-daily"
                  type="number"
                  value={dailyTarget}
                  onChange={(e) => setDailyTarget(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md font-mono-tabular"
                />
              </div>
              <div>
                <label htmlFor="goal-monthly" className="block text-xs font-medium text-slate-700 mb-1">
                  Monthly Limit (L)
                </label>
                <input
                  id="goal-monthly"
                  type="number"
                  value={monthlyLimit}
                  onChange={(e) => setMonthlyLimit(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md font-mono-tabular"
                />
              </div>
              <div>
                <label htmlFor="goal-baseline" className="block text-xs font-medium text-slate-700 mb-1">
                  Fallback Baseline (L/d)
                </label>
                <input
                  id="goal-baseline"
                  type="number"
                  value={baselineDaily}
                  onChange={(e) => setBaselineDaily(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md font-mono-tabular"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label htmlFor="goal-date" className="block text-xs font-medium text-slate-700 mb-1">
                  Action Start Date
                </label>
                <input
                  id="goal-date"
                  type="date"
                  value={actionStartDate}
                  onChange={(e) => setActionStartDate(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md font-mono-tabular"
                />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="goal-label" className="block text-xs font-medium text-slate-700 mb-1">
                  Conservation Measure Taken
                </label>
                <input
                  id="goal-label"
                  type="text"
                  value={actionLabel}
                  onChange={(e) => setActionLabel(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md"
                />
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 text-sm font-medium text-white bg-[#0F766E] rounded-md hover:bg-[#0D625B] disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save Conservation Goals'}
              </button>
            </div>
          </form>
        </div>

        <div className="lg:col-span-6 bg-white border border-slate-200 rounded-lg p-6">
          <h3 className="font-display text-base font-semibold text-[#0F172A]">
            Before vs After Conservation Comparison
          </h3>
          <p className="text-xs text-slate-500 mt-0.5 mb-4">
            Compares average daily usage before <span className="font-mono-tabular">{goal.actionStartDate}</span> ({conservation.beforeAvgLiters} L/d) vs after ({conservation.afterAvgLiters} L/d).
          </p>
          <ChartCanvas
            type="bar"
            data={comparisonChartData}
            heightClass="h-60"
            testId="conservation-comparison-chart"
            ariaLabel="Before versus after conservation water consumption bar chart"
            options={{
              plugins: { legend: { display: false } },
              scales: {
                y: { beginAtZero: true, grid: { color: '#F1F5F9' } },
                x: { grid: { display: false } },
              },
            }}
          />
        </div>
      </section>

      {/* Personalized Recommendations */}
      <section className="bg-white border border-slate-200 rounded-lg p-6">
        <div className="mb-4">
          <h2 className="font-display text-base font-semibold text-[#0F172A]">
            Personalized Conservation Recommendations
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Generated by <span className="font-mono-tabular">ConservationManager</span> from your night-flow, weekend ratio, and target gap.
          </p>
        </div>

        <div className="divide-y divide-slate-100">
          {conservation.recommendations.map((rec) => (
            <div key={rec.id} className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
                  <span className="font-medium text-[#0F766E]">{rec.category}</span>
                  <span>·</span>
                  <span className="font-mono-tabular text-[#15803D] font-medium">
                    Est. {rec.estimatedDailySavingsLiters} L/day savings
                  </span>
                </div>
                <div className="text-sm font-semibold text-[#0F172A]">{rec.title}</div>
                <p className="text-xs text-slate-600 mt-1 max-w-2xl">{rec.rationale}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
