import { useMemo, useState } from 'react';
import { Database, Pencil, Plus, Trash2 } from 'lucide-react';
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

  // Add/Edit form state
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingSource, setEditingSource] = useState<DataSource>('manual');
  const [date, setDate] = useState(today);
  const [volumeLiters, setVolumeLiters] = useState('');
  const [nightFlowLph, setNightFlowLph] = useState('2.5');
  const [notes, setNotes] = useState('');
  const [formError, setFormError] = useState('');
  const [formSuccess, setFormSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Filter state
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
          label: 'Daily Volume (L)',
          data: chronologicalFiltered.map((r) => r.volumeLiters),
          borderColor: '#0284C7',
          backgroundColor: 'rgba(2, 132, 199, 0.10)',
          borderWidth: 2,
          pointRadius: chronologicalFiltered.length > 45 ? 1.5 : 3,
          tension: 0.2,
          fill: true,
        },
      ],
    }),
    [chronologicalFiltered]
  );

  const weeklyChartData = useMemo(() => {
    const groups = new Map<string, number>();
    for (const r of chronologicalFiltered) {
      const d = new Date(`${r.date}T12:00:00Z`);
      const dayNum = d.getUTCDay() || 7;
      d.setUTCDate(d.getUTCDate() + 4 - dayNum);
      const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
      const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
      const key = `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
      groups.set(key, (groups.get(key) ?? 0) + r.volumeLiters);
    }
    const entries = Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b));
    return {
      labels: entries.map(([k]) => k),
      datasets: [
        {
          label: 'Weekly Total (L)',
          data: entries.map(([, v]) => Number(v.toFixed(1))),
          backgroundColor: '#0F766E',
          borderRadius: 4,
        },
      ],
    };
  }, [chronologicalFiltered]);

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
    setFormError('');
    setFormSuccess('');

    const vol = Number(volumeLiters);
    const night = Number(nightFlowLph);
    if (!date) {
      setFormError('Please select a valid date.');
      return;
    }
    if (!volumeLiters || Number.isNaN(vol) || vol <= 0 || vol > 50000) {
      setFormError('Water volume must be between 1 and 50,000 liters.');
      return;
    }
    if (nightFlowLph === '' || Number.isNaN(night) || night < 0 || night > 2000) {
      setFormError('Nighttime flow must be between 0 and 2,000 L/h.');
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
        setFormSuccess(`Saved manual reading (${vol} L) for ${date}.`);
        setVolumeLiters('');
        setNotes('');
      }
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Unable to save reading.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Top Form + Dataset Actions */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 bg-white border border-slate-200 rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-display text-base font-semibold text-[#0F172A]">
                {editingId !== null ? 'Edit Water Usage Record' : 'Log Water Usage Reading'}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Simulated flow sensor ({workspace.sensorInfo.sensorId}) captures daily volume and nighttime flow rate.
              </p>
            </div>
            {editingId !== null && (
              <button
                type="button"
                onClick={resetForm}
                className="text-xs font-medium text-slate-600 hover:text-[#0F172A] underline"
              >
                Cancel Edit
              </button>
            )}
          </div>

          {formError && (
            <div className="mb-4 p-3 text-xs text-[#DC2626] bg-red-50 border border-red-200 rounded-md" role="alert">
              {formError}
            </div>
          )}
          {formSuccess && (
            <div className="mb-4 p-3 text-xs text-[#15803D] bg-emerald-50 border border-emerald-200 rounded-md" role="status">
              {formSuccess}
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label htmlFor="reading-date" className="block text-xs font-medium text-slate-700 mb-1">
                Reading Date
              </label>
              <input
                id="reading-date"
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md font-mono-tabular focus:outline-none focus:border-[#0F766E]"
              />
            </div>

            <div>
              <label htmlFor="reading-volume" className="block text-xs font-medium text-slate-700 mb-1">
                Consumption (Liters)
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
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md font-mono-tabular focus:outline-none focus:border-[#0F766E]"
              />
            </div>

            <div>
              <label htmlFor="reading-nightflow" className="block text-xs font-medium text-slate-700 mb-1">
                Night Flow (L/h)
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
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md font-mono-tabular focus:outline-none focus:border-[#0F766E]"
              />
            </div>

            <div>
              <label htmlFor="reading-notes" className="block text-xs font-medium text-slate-700 mb-1">
                Notes (Optional)
              </label>
              <input
                id="reading-notes"
                type="text"
                maxLength={240}
                placeholder="Laundry, garden, etc."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:border-[#0F766E]"
              />
            </div>

            <div className="sm:col-span-2 lg:col-span-4 flex items-center justify-end gap-3 pt-1">
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-[#0F766E] rounded-md hover:bg-[#0D625B] disabled:opacity-50 whitespace-nowrap"
              >
                <Plus className="w-4 h-4" aria-hidden="true" />
                <span>
                  {submitting
                    ? 'Saving...'
                    : editingId !== null
                    ? 'Update Reading'
                    : 'Save Reading'}
                </span>
              </button>
            </div>
          </form>
        </div>

        {/* Sample Data Management Panel */}
        <div className="lg:col-span-4 bg-white border border-slate-200 rounded-lg p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 text-[#0F172A]">
              <Database className="w-4 h-4 text-[#0F766E]" aria-hidden="true" />
              <h2 className="font-display text-base font-semibold">Sample Simulation Dataset</h2>
            </div>
            <p className="text-xs text-slate-600 mt-2 leading-relaxed">
              Load 92 days of deterministic meter data with weekday/weekend cadence, gradual trend, conservation shift, and simulated nighttime leak periods. Manual readings are always preserved separately.
            </p>
            <div className="mt-3 text-xs text-slate-500">
              Stored records:{' '}
              <span className="font-mono-tabular font-medium text-[#0F172A]">
                {workspace.readings.filter((r) => r.source === 'manual').length} Manual
              </span>{' '}
              ·{' '}
              <span className="font-mono-tabular font-medium text-[#0F172A]">
                {workspace.readings.filter((r) => r.source === 'demo').length} Demo
              </span>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onLoadDemo}
              className="flex-1 px-3 py-2 text-xs font-medium text-[#0F172A] bg-slate-50 border border-slate-300 rounded-md hover:bg-slate-100 whitespace-nowrap"
            >
              Load Sample Data (92d)
            </button>
            <button
              type="button"
              onClick={onClearDemo}
              className="px-3 py-2 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-md hover:bg-slate-50 whitespace-nowrap"
            >
              Clear Demo Only
            </button>
          </div>
        </div>
      </section>

      {/* Date Filter Bar */}
      <section className="bg-white border border-slate-200 rounded-lg p-4 flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label htmlFor="filter-start" className="block text-xs font-medium text-slate-600 mb-1">
              From Date
            </label>
            <input
              id="filter-start"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="px-3 py-1.5 text-xs border border-slate-300 rounded-md font-mono-tabular"
            />
          </div>
          <div>
            <label htmlFor="filter-end" className="block text-xs font-medium text-slate-600 mb-1">
              To Date
            </label>
            <input
              id="filter-end"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="px-3 py-1.5 text-xs border border-slate-300 rounded-md font-mono-tabular"
            />
          </div>
          <div>
            <span className="block text-xs font-medium text-slate-600 mb-1">Source</span>
            <div className="inline-flex items-center gap-1 p-0.5 bg-slate-100 rounded-md">
              {(['all', 'manual', 'demo'] as const).map((src) => (
                <button
                  key={src}
                  type="button"
                  onClick={() => setSourceFilter(src)}
                  className={`px-2.5 py-1 text-xs font-medium rounded transition-colors capitalize ${
                    sourceFilter === src
                      ? 'bg-white text-[#0F172A] shadow-xs'
                      : 'text-slate-600 hover:text-[#0F172A]'
                  }`}
                >
                  {src}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-500 font-mono-tabular">
            Showing {filteredReadings.length} of {workspace.readings.length} readings
          </span>
          {(startDate || endDate || sourceFilter !== 'all') && (
            <button
              type="button"
              onClick={() => {
                setStartDate('');
                setEndDate('');
                setSourceFilter('all');
              }}
              className="px-2.5 py-1.5 text-xs font-medium text-slate-600 border border-slate-200 rounded-md hover:bg-slate-50"
            >
              Reset Filters
            </button>
          )}
        </div>
      </section>

      {/* Daily & Weekly Filtered Charts */}
      {chronologicalFiltered.length > 0 && (
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white border border-slate-200 rounded-lg p-6">
            <h3 className="font-display text-sm font-semibold text-[#0F172A] mb-3">
              Daily Consumption Pattern (Filtered)
            </h3>
            <ChartCanvas
              type="line"
              data={dailyChartData}
              heightClass="h-56"
              testId="monitoring-daily-chart"
              ariaLabel="Filtered daily water consumption line chart"
              options={{
                plugins: { legend: { display: false } },
                scales: {
                  y: { beginAtZero: true, grid: { color: '#F1F5F9' } },
                  x: { grid: { display: false } },
                },
              }}
            />
          </div>
          <div className="bg-white border border-slate-200 rounded-lg p-6">
            <h3 className="font-display text-sm font-semibold text-[#0F172A] mb-3">
              Weekly Totals (Filtered)
            </h3>
            <ChartCanvas
              type="bar"
              data={weeklyChartData}
              heightClass="h-56"
              testId="monitoring-weekly-chart"
              ariaLabel="Filtered weekly water consumption bar chart"
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
      )}

      {/* Consumption History Table */}
      <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="font-display text-base font-semibold text-[#0F172A]">
            Consumption History Log
          </h2>
          <span className="text-xs text-slate-500">Newest records first</span>
        </div>

        {filteredReadings.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            No readings match the current filter criteria.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500">
                  <th className="py-2.5 px-4">Date</th>
                  <th className="py-2.5 px-4 text-right">Volume (L)</th>
                  <th className="py-2.5 px-4 text-right">Night Flow (L/h)</th>
                  <th className="py-2.5 px-4">Source</th>
                  <th className="py-2.5 px-4">Notes</th>
                  <th className="py-2.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filteredReadings.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/60">
                    <td className="py-2.5 px-4 font-mono-tabular text-xs text-[#0F172A] whitespace-nowrap">
                      {r.date}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono-tabular font-medium text-[#0F172A] whitespace-nowrap">
                      {r.volumeLiters.toLocaleString()} L
                    </td>
                    <td
                      className={`py-2.5 px-4 text-right font-mono-tabular text-xs whitespace-nowrap ${
                        r.nightFlowLph >= workspace.settings.nightFlowThresholdLph
                          ? 'text-[#DC2626] font-semibold'
                          : 'text-slate-600'
                      }`}
                    >
                      {r.nightFlowLph.toFixed(1)} L/h
                    </td>
                    <td className="py-2.5 px-4 text-xs whitespace-nowrap">
                      <span
                        className={
                          r.source === 'manual' ? 'text-[#0F766E] font-semibold' : 'text-slate-500'
                        }
                      >
                        {r.source === 'manual' ? 'Manual Entry' : 'Demo Dataset'}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-xs text-slate-600 max-w-xs truncate">
                      {r.notes || '—'}
                    </td>
                    <td className="py-2.5 px-4 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => startEdit(r)}
                          aria-label={`Edit reading ${r.date} (${r.id})`}
                          className="p-1.5 text-slate-500 hover:text-[#0F766E] rounded hover:bg-slate-100"
                        >
                          <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteReading(r.id)}
                          aria-label={`Delete reading ${r.date} (${r.id})`}
                          className="p-1.5 text-slate-500 hover:text-[#DC2626] rounded hover:bg-red-50"
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
