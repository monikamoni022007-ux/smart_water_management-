import { useMemo, useState } from 'react';
import { Pencil, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { ChartCanvas } from '../components/ChartCanvas';
import { DataSource, ReadingItem, WorkspacePayload } from '../types/api';

interface MonitoringPageProps {
  workspace: WorkspacePayload;
  onAddReading: (payload: {
    date: string;
    volumeLiters: number;
    nightFlowLph: number;
    notes: string;
  }) => Promise<void>;
  onUpdateReading: (
    id: number,
    payload: {
      date: string;
      volumeLiters: number;
      nightFlowLph: number;
      notes: string;
      source: DataSource;
    }
  ) => Promise<void>;
  onDeleteReading: (id: number) => Promise<void>;
  onLoadDemo: () => Promise<void>;
  onClearDemo: () => Promise<void>;
}

export function MonitoringPage({
  workspace,
  onAddReading,
  onUpdateReading,
  onDeleteReading,
  onLoadDemo,
  onClearDemo,
}: MonitoringPageProps) {
  const today = new Date().toISOString().slice(0, 10);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingSource, setEditingSource] = useState<DataSource>('manual');
  const [date, setDate] = useState(today);
  const [volumeLiters, setVolumeLiters] = useState('');
  const [nightFlowLph, setNightFlowLph] = useState('2.5');
  const [notes, setNotes] = useState('');
  const [formError, setFormError] = useState('');
  const [formSuccess, setFormSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [busyDemo, setBusyDemo] = useState<'load' | 'clear' | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [sourceFilter, setSourceFilter] = useState<'all' | 'manual' | 'demo'>('all');

  const filteredReadings = useMemo(() => {
    return workspace.readings
      .filter((r) => {
        if (startDate && r.date < startDate) return false;
        if (endDate && r.date > endDate) return false;
        if (sourceFilter !== 'all' && r.source !== sourceFilter) return false;
        return true;
      })
      .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
  }, [workspace.readings, startDate, endDate, sourceFilter]);

  const chronologicalFiltered = useMemo(
    () => [...filteredReadings].sort((a, b) => a.date.localeCompare(b.date)),
    [filteredReadings]
  );

  const dailyChartData = useMemo(
    () => ({
      labels: chronologicalFiltered.map((r) => r.date.slice(5)),
      datasets: [
        {
          label: 'Daily Water Used (L)',
          data: chronologicalFiltered.map((r) => r.volumeLiters),
          borderColor: '#0284C7',
          backgroundColor: 'rgba(2, 132, 199, 0.08)',
          borderWidth: 2,
          pointRadius: chronologicalFiltered.length <= 14 ? 3 : 0,
          pointHoverRadius: 5,
          pointHoverBackgroundColor: '#0284C7',
          pointHoverBorderColor: '#FFFFFF',
          pointHoverBorderWidth: 2,
          tension: 0.25,
          fill: true,
        },
      ],
    }),
    [chronologicalFiltered]
  );

  const dailyChartOptions = useMemo(
    () => ({
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx: { parsed: { y: number | null } }) =>
              `Used: ${Math.round(ctx.parsed.y ?? 0).toLocaleString()} L`,
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
            color: '#64748B',
            maxTicksLimit: 8,
            font: { family: '"IBM Plex Mono", monospace', size: 11 },
          },
        },
      },
    }),
    []
  );

  function startEdit(r: ReadingItem) {
    setEditingId(r.id);
    setEditingSource(r.source);
    setDate(r.date);
    setVolumeLiters(String(r.volumeLiters));
    setNightFlowLph(String(r.nightFlowLph));
    setNotes(r.notes);
    setFormError('');
    setFormSuccess('');
  }

  function resetForm() {
    setEditingId(null);
    setEditingSource('manual');
    setDate(today);
    setVolumeLiters('');
    setNightFlowLph('2.5');
    setNotes('');
    setFormError('');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setFormError('');
    setFormSuccess('');

    const vol = Number(volumeLiters);
    const night = Number(nightFlowLph);
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setFormError('Please choose a valid date.');
      return;
    }
    if (!volumeLiters || Number.isNaN(vol) || vol <= 0 || vol > 50000) {
      setFormError('Water used must be between 1 and 50,000 liters.');
      return;
    }
    if (nightFlowLph === '' || Number.isNaN(night) || night < 0 || night > 2000) {
      setFormError('Overnight flow must be between 0 and 2,000 liters per hour.');
      return;
    }
    if (notes.trim().length > 240) {
      setFormError('Note must be 240 characters or fewer.');
      return;
    }

    setSubmitting(true);
    try {
      if (editingId !== null) {
        await onUpdateReading(editingId, {
          date,
          volumeLiters: vol,
          nightFlowLph: night,
          notes: notes.trim(),
          source: editingSource,
        });
        setFormSuccess(`Updated reading for ${date}.`);
        resetForm();
      } else {
        await onAddReading({
          date,
          volumeLiters: vol,
          nightFlowLph: night,
          notes: notes.trim(),
        });
        setFormSuccess(`Added reading (${vol} L) for ${date}.`);
        setVolumeLiters('');
        setNotes('');
      }
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not save reading.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Top 2-Column Entry & Trend Workspace */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Form Column */}
        <div className="lg:col-span-5 surface-card p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-start justify-between gap-2 mb-4">
              <div>
                <h2 className="font-display text-base font-semibold text-[#0F172A]">
                  {editingId !== null ? 'Edit Daily Reading' : 'Add Daily Water Reading'}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                  Enter your daily meter total. Overnight flow is normally 1–4 L/h when taps are off.
                </p>
              </div>
              {editingId !== null && (
                <button
                  type="button"
                  onClick={resetForm}
                  className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-[#0F172A] underline shrink-0"
                >
                  <RotateCcw className="w-3 h-3" aria-hidden="true" />
                  <span>Cancel Edit</span>
                </button>
              )}
            </div>

            {formError && (
              <div className="mb-4 p-3 text-xs text-[#DC2626] bg-red-50/90 border border-red-200 rounded-md" role="alert">
                {formError}
              </div>
            )}
            {formSuccess && (
              <div className="mb-4 p-3 text-xs text-[#15803D] bg-emerald-50/90 border border-emerald-200 rounded-md" role="status">
                {formSuccess}
              </div>
            )}

            <form id="reading-entry-form" onSubmit={handleSubmit} noValidate className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label htmlFor="reading-date" className="block text-xs font-medium text-slate-700 mb-1.5">
                    Date
                  </label>
                  <input
                    id="reading-date"
                    type="date"
                    required
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="field-input font-mono-tabular"
                  />
                </div>

                <div>
                  <label htmlFor="reading-volume" className="block text-xs font-medium text-slate-700 mb-1.5">
                    Water Used (Liters)
                  </label>
                  <input
                    id="reading-volume"
                    type="number"
                    step="0.1"
                    min="1"
                    max="50000"
                    required
                    placeholder="e.g. 315"
                    value={volumeLiters}
                    onChange={(e) => setVolumeLiters(e.target.value)}
                    className="field-input font-mono-tabular"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label htmlFor="reading-nightflow" className="block text-xs font-medium text-slate-700 mb-1.5">
                    Overnight Flow (Liters/hour)
                  </label>
                  <input
                    id="reading-nightflow"
                    type="number"
                    step="0.1"
                    min="0"
                    max="2000"
                    required
                    placeholder="e.g. 2.5"
                    value={nightFlowLph}
                    onChange={(e) => setNightFlowLph(e.target.value)}
                    className="field-input font-mono-tabular"
                  />
                </div>

                <div>
                  <label htmlFor="reading-notes" className="block text-xs font-medium text-slate-700 mb-1.5">
                    Note (Optional)
                  </label>
                  <input
                    id="reading-notes"
                    type="text"
                    maxLength={240}
                    placeholder="Laundry, garden watering, etc."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="field-input"
                  />
                </div>
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-[#0F766E] rounded-md shadow-xs hover:bg-[#0D625B] disabled:opacity-50 whitespace-nowrap"
                >
                  <Plus className="w-4 h-4" aria-hidden="true" />
                  <span>
                    {submitting
                      ? 'Saving...'
                      : editingId !== null
                      ? 'Save Changes'
                      : 'Save Reading'}
                  </span>
                </button>
              </div>
            </form>
          </div>

          <div className="mt-5 pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
            <span>Sample dataset:</span>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={busyDemo !== null}
                onClick={async () => {
                  if (busyDemo !== null) return;
                  setFormError('');
                  setFormSuccess('');
                  setBusyDemo('load');
                  try {
                    await onLoadDemo();
                    setFormSuccess('Loaded 92 days of sample water readings.');
                  } catch (err) {
                    setFormError(err instanceof Error ? err.message : 'Could not load sample data.');
                  } finally {
                    setBusyDemo(null);
                  }
                }}
                className="px-2.5 py-1 text-xs font-medium text-slate-700 bg-slate-50 border border-slate-200 rounded-md hover:bg-slate-100 disabled:opacity-50"
              >
                {busyDemo === 'load' ? 'Loading...' : 'Load 92-Day Sample'}
              </button>
              <button
                type="button"
                disabled={busyDemo !== null}
                onClick={async () => {
                  if (busyDemo !== null) return;
                  setFormError('');
                  setFormSuccess('');
                  setBusyDemo('clear');
                  try {
                    await onClearDemo();
                    setFormSuccess('Cleared sample data while keeping your own readings.');
                  } catch (err) {
                    setFormError(err instanceof Error ? err.message : 'Could not clear sample data.');
                  } finally {
                    setBusyDemo(null);
                  }
                }}
                className="px-2 py-1 text-xs font-medium text-slate-500 hover:text-[#0F172A] underline disabled:opacity-50"
              >
                {busyDemo === 'clear' ? 'Clearing...' : 'Clear Sample Data'}
              </button>
            </div>
          </div>
        </div>

        {/* Chart & Filter Column */}
        <div className="lg:col-span-7 surface-card p-6 flex flex-col">
          <div className="flex flex-wrap items-end justify-between gap-3 pb-4 mb-4 border-b border-slate-100">
            <div>
              <h3 className="font-display text-base font-semibold text-[#0F172A]">
                Daily Water Usage Trend
              </h3>
              <p className="text-xs text-slate-500 mt-0.5 font-mono-tabular">
                Showing {filteredReadings.length} of {workspace.readings.length} readings
              </p>
            </div>

            <div className="inline-flex flex-wrap items-center gap-1 p-0.5 bg-slate-100 rounded-md">
              {(
                [
                  ['all', 'All'],
                  ['manual', 'Added by you'],
                  ['demo', 'Sample data'],
                ] as const
              ).map(([src, label]) => (
                <button
                  key={src}
                  type="button"
                  onClick={() => setSourceFilter(src)}
                  className={`px-2.5 py-1 text-xs font-medium rounded whitespace-nowrap ${
                    sourceFilter === src
                      ? 'bg-white text-[#0F172A] shadow-2xs'
                      : 'text-slate-600 hover:text-[#0F172A]'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-end gap-3 mb-4">
            <div>
              <label htmlFor="filter-start" className="block text-[11px] font-medium text-slate-500 mb-1">
                From
              </label>
              <input
                id="filter-start"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="field-input py-1.5 text-xs font-mono-tabular w-auto"
              />
            </div>
            <div>
              <label htmlFor="filter-end" className="block text-[11px] font-medium text-slate-500 mb-1">
                To
              </label>
              <input
                id="filter-end"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="field-input py-1.5 text-xs font-mono-tabular w-auto"
              />
            </div>
            {(startDate || endDate || sourceFilter !== 'all') && (
              <button
                type="button"
                onClick={() => {
                  setStartDate('');
                  setEndDate('');
                  setSourceFilter('all');
                }}
                className="px-2.5 py-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-md hover:bg-slate-50"
              >
                Clear Filters
              </button>
            )}
          </div>

          <div className="flex-1 min-h-[220px]">
            {chronologicalFiltered.length > 0 ? (
              <ChartCanvas
                type="line"
                data={dailyChartData}
                heightClass="h-60"
                testId="monitoring-daily-chart"
                ariaLabel="Daily water consumption trend"
                options={dailyChartOptions}
              />
            ) : (
              <div className="h-60 flex items-center justify-center text-sm text-slate-500 border border-dashed border-slate-200 rounded-md">
                {workspace.readings.length === 0
                  ? 'Add a reading or load sample data to view your daily trend.'
                  : 'No readings fall within your selected filters.'}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Reading History Ledger */}
      <section className="surface-card overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200/80 flex items-center justify-between">
          <div>
            <h2 className="font-display text-base font-semibold text-[#0F172A]">
              Reading History
            </h2>
          </div>
          <span className="text-xs text-slate-500">Newest first</span>
        </div>

        {filteredReadings.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">
            {workspace.readings.length === 0
              ? 'No water readings stored yet. Add a daily reading above or load sample data.'
              : 'No readings match your selected dates.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200/80 bg-slate-50/70 text-xs font-medium text-slate-500">
                  <th className="py-2.5 px-5">Date</th>
                  <th className="py-2.5 px-5 text-right">Water Used</th>
                  <th className="py-2.5 px-5 text-right">Overnight Flow</th>
                  <th className="py-2.5 px-5">Entry Type</th>
                  <th className="py-2.5 px-5">Note</th>
                  <th className="py-2.5 px-5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filteredReadings.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-2.5 px-5 font-mono-tabular text-xs text-[#0F172A] whitespace-nowrap">
                      {r.date}
                    </td>
                    <td className="py-2.5 px-5 text-right font-mono-tabular font-medium text-[#0F172A] whitespace-nowrap">
                      {r.volumeLiters.toLocaleString()} L
                    </td>
                    <td
                      className={`py-2.5 px-5 text-right font-mono-tabular text-xs whitespace-nowrap ${
                        r.nightFlowLph >= workspace.settings.nightFlowThresholdLph
                          ? 'text-[#DC2626] font-semibold'
                          : 'text-slate-600'
                      }`}
                    >
                      {r.nightFlowLph.toFixed(1)} L/h
                    </td>
                    <td className="py-2.5 px-5 text-xs whitespace-nowrap">
                      <span
                        className={
                          r.source === 'manual' ? 'text-[#0F766E] font-medium' : 'text-slate-500'
                        }
                      >
                        {r.source === 'manual' ? 'Added by you' : 'Sample data'}
                      </span>
                    </td>
                    <td className="py-2.5 px-5 text-xs text-slate-600 max-w-xs truncate">
                      {r.notes || '—'}
                    </td>
                    <td className="py-2.5 px-5 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => startEdit(r)}
                          aria-label={`Edit reading ${r.date} (${r.id})`}
                          className="p-1.5 text-slate-500 hover:text-[#0F766E] rounded-md hover:bg-slate-100"
                        >
                          <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          disabled={deletingId === r.id}
                          onClick={async () => {
                            if (deletingId === r.id) return;
                            setFormError('');
                            setFormSuccess('');
                            setDeletingId(r.id);
                            try {
                              await onDeleteReading(r.id);
                              if (editingId === r.id) resetForm();
                              setFormSuccess(`Deleted reading for ${r.date}.`);
                            } catch (err) {
                              setFormError(err instanceof Error ? err.message : 'Could not delete reading.');
                            } finally {
                              setDeletingId(null);
                            }
                          }}
                          aria-label={`Delete reading ${r.date} (${r.id})`}
                          className="p-1.5 text-slate-500 hover:text-[#DC2626] rounded-md hover:bg-red-50 disabled:opacity-40"
                        >
                          <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
