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
      labels: ['Before Change', 'After Change', 'Daily Goal'],
      datasets: [
        {
          label: 'Liters per day',
          data: [
            conservation.beforeAvgLiters,
            conservation.afterAvgLiters,
            goal.dailyTargetLiters,
          ],
          backgroundColor: ['#64748B', '#0F766E', '#0284C7'],
          borderRadius: 5,
          barThickness: 48,
        },
      ],
    }),
    [conservation.beforeAvgLiters, conservation.afterAvgLiters, goal.dailyTargetLiters]
  );

  const comparisonChartOptions = useMemo(
    () => ({
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx: { parsed: { y: number | null } }) =>
              `${Math.round(ctx.parsed.y ?? 0).toLocaleString()} L/day`,
          },
        },
      },
      scales: {
        y: {
          beginAtZero: true,
          border: { display: false },
          grid: { color: '#EEF2F6' },
          ticks: {
            color: '#64748B',
            font: { family: '"IBM Plex Mono", monospace', size: 11 },
            callback: (val: string | number) => `${val} L`,
          },
        },
        x: {
          border: { display: false },
          grid: { display: false },
          ticks: {
            color: '#334155',
            font: { family: '"DM Sans", sans-serif', size: 12 },
          },
        },
      },
    }),
    []
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    setFormError('');
    setFormSuccess('');

    const dt = Number(dailyTarget);
    const ml = Number(monthlyLimit);
    const bl = Number(baselineDaily);

    if (Number.isNaN(dt) || dt < 50 || dt > 20000) {
      setFormError('Daily goal must be between 50 and 20,000 liters.');
      return;
    }
    if (Number.isNaN(ml) || ml < 1000 || ml > 600000) {
      setFormError('Monthly limit must be between 1,000 and 600,000 liters.');
      return;
    }
    if (Number.isNaN(bl) || bl < 50 || bl > 25000) {
      setFormError('Previous daily average must be between 50 and 25,000 liters.');
      return;
    }
    if (!actionStartDate || !/^\d{4}-\d{2}-\d{2}$/.test(actionStartDate)) {
      setFormError('Please select a valid date for when your water-saving change started.');
      return;
    }
    if (actionLabel.trim().length < 3) {
      setFormError('Please describe the water-saving step you took.');
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
      setFormSuccess('Your water-saving goals have been updated.');
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Unable to save goals.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Impact Summary Strip */}
      <section className="surface-card grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-slate-200/80">
        <div className="p-5 sm:p-6">
          <div className="text-xs font-medium text-slate-500">Water Saved Per Day</div>
          <div
            className={`font-mono-tabular text-[26px] leading-tight font-semibold mt-2 ${
              conservation.estimatedDailySavingsLiters >= 0 ? 'text-[#15803D]' : 'text-[#DC2626]'
            }`}
          >
            {conservation.estimatedDailySavingsLiters >= 0 ? '+' : ''}
            {conservation.estimatedDailySavingsLiters} L/day
          </div>
          <div className="text-xs text-slate-500 mt-1.5">
            {conservation.savingsPercent >= 0
              ? `${conservation.savingsPercent}% less than before`
              : 'Above previous daily average'}
          </div>
        </div>

        <div className="p-5 sm:p-6">
          <div className="text-xs font-medium text-slate-500">Estimated Total Saved</div>
          <div className="font-mono-tabular text-[26px] leading-tight font-semibold text-[#15803D] mt-2">
            {conservation.estimatedTotalSavedLiters.toLocaleString()} L
          </div>
          <div className="text-xs text-slate-500 mt-1.5">Since {goal.actionStartDate}</div>
        </div>

        <div className="p-5 sm:p-6">
          <div className="text-xs font-medium text-slate-500">Monthly Budget Remaining</div>
          <div
            className={`font-mono-tabular text-[26px] leading-tight font-semibold mt-2 ${
              conservation.monthlyLimitRemainingLiters >= 0 ? 'text-[#0F766E]' : 'text-[#DC2626]'
            }`}
          >
            {Math.round(conservation.monthlyLimitRemainingLiters).toLocaleString()} L
          </div>
          <div className="text-xs text-slate-500 mt-1.5">
            {conservation.daysWithinDailyTarget} of {conservation.totalEvaluatedDays} days met daily goal
          </div>
        </div>
      </section>

      {/* Targets Form & Before/After Chart */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        <div className="lg:col-span-6 surface-card p-6 flex flex-col justify-between">
          <div>
            <h2 className="font-display text-base font-semibold text-[#0F172A]">
              Your Water-Saving Goal
            </h2>
            <p className="text-xs text-slate-500 mt-0.5 mb-4 leading-relaxed">
              Set a daily target and track how a water-saving change reduces your household usage.
            </p>

            {formError && (
              <div className="mb-3 p-3 text-xs text-[#DC2626] bg-red-50/90 border border-red-200 rounded-md" role="alert">
                {formError}
              </div>
            )}
            {formSuccess && (
              <div className="mb-3 p-3 text-xs text-[#15803D] bg-emerald-50/90 border border-emerald-200 rounded-md" role="status">
                {formSuccess}
              </div>
            )}

            <form onSubmit={handleSubmit} noValidate className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                <div>
                  <label htmlFor="goal-daily" className="block text-xs font-medium text-slate-700 mb-1.5">
                    Daily Goal (Liters)
                  </label>
                  <input
                    id="goal-daily"
                    type="number"
                    value={dailyTarget}
                    onChange={(e) => setDailyTarget(e.target.value)}
                    className="field-input font-mono-tabular"
                  />
                </div>
                <div>
                  <label htmlFor="goal-monthly" className="block text-xs font-medium text-slate-700 mb-1.5">
                    Monthly Limit (Liters)
                  </label>
                  <input
                    id="goal-monthly"
                    type="number"
                    value={monthlyLimit}
                    onChange={(e) => setMonthlyLimit(e.target.value)}
                    className="field-input font-mono-tabular"
                  />
                </div>
                <div>
                  <label htmlFor="goal-baseline" className="block text-xs font-medium text-slate-700 mb-1.5">
                    Previous Avg (L/day)
                  </label>
                  <input
                    id="goal-baseline"
                    type="number"
                    value={baselineDaily}
                    onChange={(e) => setBaselineDaily(e.target.value)}
                    className="field-input font-mono-tabular"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                <div>
                  <label htmlFor="goal-date" className="block text-xs font-medium text-slate-700 mb-1.5">
                    Started On
                  </label>
                  <input
                    id="goal-date"
                    type="date"
                    value={actionStartDate}
                    onChange={(e) => setActionStartDate(e.target.value)}
                    className="field-input font-mono-tabular"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor="goal-label" className="block text-xs font-medium text-slate-700 mb-1.5">
                    What change did you make?
                  </label>
                  <input
                    id="goal-label"
                    type="text"
                    value={actionLabel}
                    onChange={(e) => setActionLabel(e.target.value)}
                    className="field-input"
                  />
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 text-sm font-medium text-white bg-[#0F766E] rounded-md shadow-xs hover:bg-[#0D625B] disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Save Goals'}
                </button>
              </div>
            </form>
          </div>
        </div>

        <div className="lg:col-span-6 surface-card p-6 flex flex-col">
          <h3 className="font-display text-base font-semibold text-[#0F172A]">
            Before vs After Comparison
          </h3>
          <p className="text-xs text-slate-500 mt-0.5 mb-4">
            {workspace.readings.length === 0
              ? 'Add water readings or load sample data to compare usage before and after your change.'
              : `Average daily use before ${goal.actionStartDate} (${conservation.beforeAvgLiters} L) vs after (${conservation.afterAvgLiters} L).`}
          </p>
          <div className="flex-1 min-h-[220px]">
            <ChartCanvas
              type="bar"
              data={comparisonChartData}
              heightClass="h-60"
              testId="conservation-comparison-chart"
              ariaLabel="Before and after water conservation comparison"
              options={comparisonChartOptions}
            />
          </div>
        </div>
      </section>

      {/* Practical Recommendations */}
      <section className="surface-card overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200/80">
          <h2 className="font-display text-base font-semibold text-[#0F172A]">
            Practical Ways to Save Water
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Suggestions tailored to your household’s recent readings.
          </p>
        </div>

        <div className="divide-y divide-slate-100">
          {conservation.recommendations.map((rec) => (
            <div
              key={rec.id}
              className="px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/50 transition-colors"
            >
              <div>
                <div className="text-sm font-semibold text-[#0F172A]">{rec.title}</div>
                <p className="text-xs text-slate-600 mt-1 max-w-2xl leading-relaxed">{rec.rationale}</p>
              </div>
              <div className="font-mono-tabular text-xs font-semibold text-[#15803D] whitespace-nowrap shrink-0">
                Save ~{rec.estimatedDailySavingsLiters} L/day
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
