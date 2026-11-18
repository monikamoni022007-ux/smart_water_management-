import { useCallback, useEffect, useState } from 'react';
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
    title: 'Overview Dashboard',
    subtitle: 'Daily consumption, forecast accuracy, conservation goals, and leak risk',
  },
  monitoring: {
    title: 'Usage Monitoring',
    subtitle: 'Record, edit, filter, and inspect water consumption logs',
  },
  prediction: {
    title: 'Usage Prediction',
    subtitle: 'Interchangeable forecasting strategies comparing actual and projected demand',
  },
  leaks: {
    title: 'Leak Detection',
    subtitle: 'Possible leak analysis using multi-period surges and continuous nighttime flow',
  },
  conservation: {
    title: 'Conservation Management',
    subtitle: 'Targets, before-and-after impact tracking, and household recommendations',
  },
  reports: {
    title: 'Reports & Export',
    subtitle: 'Daily, weekly, monthly, forecast, leak, and conservation summaries',
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

  const loadAll = useCallback(
    async (userId: number, strategy?: ForecastMethodKey, horizon?: number) => {
      try {
        setError('');
        const [usersRes, ws] = await Promise.all([
          api.listUsers(),
          api.getWorkspace(userId, strategy, horizon),
        ]);
        setUsers(usersRes.users);
        setWorkspace(ws);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to load water analytics data.');
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    loadAll(activeUserId, strategyOverride, horizonOverride);
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
    await api.deleteReading(activeUserId, id);
    await refreshWorkspace();
  }

  async function handleLoadDemo() {
    await api.loadDemoData(activeUserId, 'full90');
    await refreshWorkspace();
  }

  async function handleClearDemo() {
    await api.clearDemoData(activeUserId);
    await refreshWorkspace();
  }

  async function handleChangePredictionConfig(strategy: ForecastMethodKey, horizon: number) {
    setStrategyOverride(strategy);
    setHorizonOverride(horizon);
    await api.updateSettings(activeUserId, {
      forecastStrategy: strategy,
      forecastHorizonDays: horizon,
    });
    await loadAll(activeUserId, strategy, horizon);
  }

  async function handleUpdateThresholds(patch: Partial<UserSettings>) {
    await api.updateSettings(activeUserId, patch);
    await refreshWorkspace();
  }

  async function handleUpdateAlertStatus(alertId: number, status: AlertStatus) {
    await api.updateAlertStatus(activeUserId, alertId, status);
    await refreshWorkspace();
  }

  async function handleSaveGoal(goal: Omit<ConservationGoal, 'userId' | 'id'>) {
    await api.updateConservationGoal(activeUserId, goal);
    await refreshWorkspace();
  }

  if (loading && !workspace) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center p-6">
        <div className="text-sm text-slate-600">Loading Smart Water Management System...</div>
      </div>
    );
  }

  if (error && !workspace) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center p-6">
        <div className="bg-white border border-slate-200 rounded-lg p-6 max-w-md text-center space-y-3">
          <h1 className="font-display text-lg font-semibold text-[#0F172A]">Connection Error</h1>
          <p className="text-sm text-slate-600">{error}</p>
          <button
            type="button"
            onClick={() => {
              setActiveUserId(1);
              window.localStorage.setItem('aqualedger_user_id', '1');
              loadAll(1);
            }}
            className="px-4 py-2 text-xs font-medium text-white bg-[#0F766E] rounded-md"
          >
            Reload Workspace
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
    <div className="min-h-screen bg-[#F8FAFC] flex">
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
        <header className="h-16 bg-white border-b border-slate-200 px-4 sm:px-8 flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open navigation menu"
              className="lg:hidden p-2 -ml-2 text-slate-600 hover:text-[#0F172A] rounded-md"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <h1 className="font-display text-lg font-semibold text-[#0F172A] truncate">
                {currentMeta.title}
              </h1>
              <p className="hidden sm:block text-xs text-slate-500 truncate">{currentMeta.subtitle}</p>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => setActivePage('monitoring')}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-[#0F766E] rounded-md hover:bg-[#0D625B] transition-colors whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Log Reading</span>
            </button>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1400px] w-full mx-auto">
          {error && (
            <div className="mb-4 p-3 text-xs text-[#DC2626] bg-red-50 border border-red-200 rounded-md" role="alert">
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
