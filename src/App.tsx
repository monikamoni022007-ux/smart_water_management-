import { useCallback, useEffect, useRef, useState } from 'react';
import { Menu, Plus } from 'lucide-react';
import { AccountModal } from './components/AccountModal';
import { PageId, Sidebar } from './components/Sidebar';
import { ConservationPage } from './pages/ConservationPage';
import { DashboardPage } from './pages/DashboardPage';
import { LeakDetectionPage } from './pages/LeakDetectionPage';
import { MonitoringPage } from './pages/MonitoringPage';
import { PredictionPage } from './pages/PredictionPage';
import { ReportsPage } from './pages/ReportsPage';
import {
  AlertStatus,
  ConservationGoal,
  DataSource,
  ForecastMethodKey,
  UserAccount,
  UserSettings,
  WorkspacePayload,
} from './types/api';
import { api } from './utils/apiClient';

const PAGE_TITLES: Record<PageId, { title: string; subtitle: string }> = {
  dashboard: {
    title: 'Dashboard',
    subtitle: 'A clear summary of today’s usage, monthly total, status, and goals',
  },
  monitoring: {
    title: 'Water Usage',
    subtitle: 'Add, update, or review your daily household water readings',
  },
  prediction: {
    title: 'Usage Prediction',
    subtitle: 'Estimate how much water your home is likely to use next',
  },
  leaks: {
    title: 'Leak Detection',
    subtitle: 'Check unusual water flow that could point to a possible leak',
  },
  conservation: {
    title: 'Water Conservation',
    subtitle: 'Set daily targets, see your savings, and get practical tips',
  },
  reports: {
    title: 'Reports',
    subtitle: 'Review your usage history and download CSV summaries',
  },
};

export default function App() {
  const [activePage, setActivePage] = useState<PageId>('dashboard');
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [activeUserId, setActiveUserId] = useState<number>(() => {
    const saved = window.localStorage.getItem('aqualedger_user_id');
    return saved ? Number(saved) || 1 : 1;
  });
  const [workspace, setWorkspace] = useState<WorkspacePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [accountModalOpen, setAccountModalOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [strategyOverride, setStrategyOverride] = useState<ForecastMethodKey | undefined>(undefined);
  const [horizonOverride, setHorizonOverride] = useState<number | undefined>(undefined);

  const activeFetchController = useRef<AbortController | null>(null);

  const loadAll = useCallback(
    async (userId: number, strategy?: ForecastMethodKey, horizon?: number) => {
      activeFetchController.current?.abort();
      const controller = new AbortController();
      activeFetchController.current = controller;

      try {
        setError('');
        const [usersRes, ws] = await Promise.all([
          api.listUsers(controller.signal),
          api.getWorkspace(userId, strategy, horizon, controller.signal),
        ]);
        if (controller.signal.aborted) return;
        setUsers(usersRes.users);
        setWorkspace(ws);
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setError(err instanceof Error ? err.message : 'Unable to load water data.');
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    },
    []
  );

  useEffect(() => {
    loadAll(activeUserId, strategyOverride, horizonOverride);
    return () => {
      activeFetchController.current?.abort();
    };
  }, [activeUserId, strategyOverride, horizonOverride, loadAll]);

  function handleSwitchUser(user: UserAccount) {
    window.localStorage.setItem('aqualedger_user_id', String(user.id));
    setStrategyOverride(undefined);
    setHorizonOverride(undefined);
    setActiveUserId(user.id);
  }

  async function refreshWorkspace() {
    await loadAll(activeUserId, strategyOverride, horizonOverride);
  }

  async function handleAddReading(payload: {
    date: string;
    volumeLiters: number;
    nightFlowLph: number;
    notes: string;
  }) {
    await api.addReading(activeUserId, payload);
    await refreshWorkspace();
  }

  async function handleUpdateReading(
    id: number,
    payload: {
      date: string;
      volumeLiters: number;
      nightFlowLph: number;
      notes: string;
      source: DataSource;
    }
  ) {
    await api.updateReading(activeUserId, id, payload);
    await refreshWorkspace();
  }

  async function handleDeleteReading(id: number) {
    try {
      await api.deleteReading(activeUserId, id);
      await refreshWorkspace();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete reading.');
      throw err;
    }
  }

  async function handleLoadDemo() {
    try {
      await api.loadDemoData(activeUserId, 'full90');
      await refreshWorkspace();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load sample data.');
      throw err;
    }
  }

  async function handleClearDemo() {
    try {
      await api.clearDemoData(activeUserId);
      await refreshWorkspace();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not clear sample data.');
      throw err;
    }
  }

  async function handleChangePredictionConfig(strategy: ForecastMethodKey, horizon: number) {
    try {
      await api.updateSettings(activeUserId, {
        forecastStrategy: strategy,
        forecastHorizonDays: horizon,
      });
      setStrategyOverride(strategy);
      setHorizonOverride(horizon);
      await loadAll(activeUserId, strategy, horizon);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update prediction settings.');
      throw err;
    }
  }

  async function handleUpdateThresholds(patch: Partial<UserSettings>) {
    await api.updateSettings(activeUserId, patch);
    await refreshWorkspace();
  }

  async function handleUpdateAlertStatus(alertId: number, status: AlertStatus) {
    try {
      await api.updateAlertStatus(activeUserId, alertId, status);
      await refreshWorkspace();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update alert status.');
      throw err;
    }
  }

  async function handleSaveGoal(goal: Omit<ConservationGoal, 'userId' | 'id'>) {
    await api.updateConservationGoal(activeUserId, goal);
    await refreshWorkspace();
  }

  if (loading && !workspace) {
    return (
      <div className="min-h-screen bg-[#F6F8FB] flex">
        <div className="hidden lg:block w-[248px] bg-[#FBFBFC] border-r border-slate-200/90 p-5 space-y-6">
          <div className="h-7 w-32 bg-slate-200/70 rounded animate-pulse" />
          <div className="space-y-2 pt-2">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="h-8 bg-slate-200/50 rounded-md animate-pulse" />
            ))}
          </div>
        </div>
        <div className="flex-1 p-6 sm:p-8 max-w-[1200px] w-full mx-auto space-y-6">
          <div className="h-7 w-48 bg-slate-200/70 rounded animate-pulse" />
          <div className="surface-card h-28 animate-pulse" />
          <div className="surface-card h-72 animate-pulse" />
        </div>
      </div>
    );
  }

  if (error && !workspace) {
    return (
      <div className="min-h-screen bg-[#F6F8FB] flex items-center justify-center p-6">
        <div className="surface-card p-8 max-w-md text-center space-y-3">
          <h1 className="font-display text-lg font-semibold text-[#0F172A]">Connection Error</h1>
          <p className="text-sm text-slate-600 leading-relaxed">{error}</p>
          <button
            type="button"
            onClick={() => {
              setActiveUserId(1);
              window.localStorage.setItem('aqualedger_user_id', '1');
              loadAll(1);
            }}
            className="px-4 py-2 text-xs font-medium text-white bg-[#0F766E] rounded-md hover:bg-[#0D625B] shadow-xs"
          >
            Reload
          </button>
        </div>
      </div>
    );
  }

  if (!workspace) return null;

  const currentMeta = PAGE_TITLES[activePage];
  const activeStrategy = strategyOverride ?? workspace.settings.forecastStrategy;
  const activeHorizon = horizonOverride ?? workspace.settings.forecastHorizonDays;

  return (
    <div className="min-h-screen bg-[#F6F8FB] flex">
      <Sidebar
        activePage={activePage}
        onNavigate={setActivePage}
        activeAlertCount={workspace.leakAnalysis.activeAlertsCount}
        user={workspace.user}
        meterId={workspace.meterId}
        onOpenAccountModal={() => setAccountModalOpen(true)}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
      />

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 bg-white/95 backdrop-blur-xs border-b border-slate-200/80 px-4 sm:px-8 flex items-center justify-between gap-4 shrink-0 sticky top-0 z-20">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open navigation menu"
              className="lg:hidden p-2 -ml-2 text-slate-600 hover:text-[#0F172A] rounded-md hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F766E]/30"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <h1 className="font-display text-[17px] font-semibold text-[#0F172A] tracking-tight truncate">
                {currentMeta.title}
              </h1>
              <p className="hidden sm:block text-xs text-slate-500 truncate">{currentMeta.subtitle}</p>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => setActivePage('monitoring')}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-[#0F766E] rounded-md shadow-xs hover:bg-[#0D625B] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F766E]/35 whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Add Reading</span>
            </button>
          </div>
        </header>

        <main className="flex-1 px-4 py-6 sm:px-8 sm:py-7 max-w-[1200px] w-full mx-auto">
          {error && (
            <div className="mb-5 p-3.5 text-xs text-[#DC2626] bg-red-50/90 border border-red-200 rounded-md" role="alert">
              {error}
            </div>
          )}

          {activePage === 'dashboard' && (
            <DashboardPage
              workspace={workspace}
              onNavigate={setActivePage}
              onAcknowledgeAlert={(id) => handleUpdateAlertStatus(id, 'Acknowledged')}
              onLoadDemo={handleLoadDemo}
            />
          )}

          {activePage === 'monitoring' && (
            <MonitoringPage
              workspace={workspace}
              onAddReading={handleAddReading}
              onUpdateReading={handleUpdateReading}
              onDeleteReading={handleDeleteReading}
              onLoadDemo={handleLoadDemo}
              onClearDemo={handleClearDemo}
            />
          )}

          {activePage === 'prediction' && (
            <PredictionPage
              workspace={workspace}
              activeStrategy={activeStrategy}
              activeHorizon={activeHorizon}
              onChangePredictionConfig={handleChangePredictionConfig}
            />
          )}

          {activePage === 'leaks' && (
            <LeakDetectionPage
              workspace={workspace}
              onUpdateThresholds={handleUpdateThresholds}
              onUpdateAlertStatus={handleUpdateAlertStatus}
            />
          )}

          {activePage === 'conservation' && (
            <ConservationPage workspace={workspace} onSaveGoal={handleSaveGoal} />
          )}

          {activePage === 'reports' && <ReportsPage workspace={workspace} />}
        </main>
      </div>

      <AccountModal
        open={accountModalOpen}
        onClose={() => setAccountModalOpen(false)}
        users={users}
        activeUser={workspace.user}
        onSelectUser={handleSwitchUser}
        onUserCreated={(u) => handleSwitchUser(u)}
      />
    </div>
  );
}
