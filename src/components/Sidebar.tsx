import {
  Activity,
  AlertTriangle,
  Droplets,
  FileSpreadsheet,
  LayoutDashboard,
  Leaf,
  TrendingUp,
  UserCheck,
  X,
} from 'lucide-react';
import { UserAccount } from '../types/api';

export type PageId =
  | 'dashboard'
  | 'monitoring'
  | 'prediction'
  | 'leaks'
  | 'conservation'
  | 'reports';

interface SidebarProps {
  activePage: PageId;
  onNavigate: (page: PageId) => void;
  activeAlertCount: number;
  user: UserAccount;
  meterId: string;
  onOpenAccountModal: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

const NAV_ITEMS: Array<{ id: PageId; label: string; icon: typeof LayoutDashboard }> = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'monitoring', label: 'Usage Monitoring', icon: Activity },
  { id: 'prediction', label: 'Prediction', icon: TrendingUp },
  { id: 'leaks', label: 'Leak Detection', icon: AlertTriangle },
  { id: 'conservation', label: 'Conservation', icon: Leaf },
  { id: 'reports', label: 'Reports', icon: FileSpreadsheet },
];

export function Sidebar({
  activePage,
  onNavigate,
  activeAlertCount,
  user,
  meterId,
  onOpenAccountModal,
  mobileOpen,
  onCloseMobile,
}: SidebarProps) {
  const navContent = (
    <div className="flex flex-col h-full bg-white border-r border-slate-200 w-64">
      <div className="h-16 px-5 flex items-center justify-between border-b border-slate-200 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-md bg-[#0F766E] flex items-center justify-center text-white shrink-0">
            <Droplets className="w-4 h-4" aria-hidden="true" />
          </div>
          <span className="font-display font-bold text-base tracking-tight text-[#0F172A] whitespace-nowrap">
            AquaLedger
          </span>
        </div>
        <button
          type="button"
          onClick={onCloseMobile}
          aria-label="Close navigation menu"
          className="lg:hidden p-1.5 text-slate-500 hover:text-slate-900 rounded-md"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <nav aria-label="Primary navigation" className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activePage === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                onNavigate(item.id);
                onCloseMobile();
              }}
              aria-current={isActive ? 'page' : undefined}
              className={`w-full flex items-center justify-between px-3 py-2.5 text-sm font-medium rounded-md transition-colors whitespace-nowrap ${
                isActive
                  ? 'bg-[#F0FDFA] text-[#0F766E]'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-[#0F172A]'
              }`}
            >
              <span className="flex items-center gap-2.5">
                <Icon
                  className={`w-4 h-4 shrink-0 ${isActive ? 'text-[#0F766E]' : 'text-slate-400'}`}
                  aria-hidden="true"
                />
                <span>{item.label}</span>
              </span>
              {item.id === 'leaks' && activeAlertCount > 0 && (
                <span className="font-mono-tabular text-xs font-semibold text-[#DC2626]">
                  {activeAlertCount}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="p-4 border-t border-slate-200 shrink-0">
        <div className="text-xs text-slate-500 mb-1">Active Household</div>
        <div className="text-sm font-semibold text-[#0F172A] truncate">{user.householdName}</div>
        <div className="text-xs text-slate-500 mt-0.5 truncate">
          {user.name} · <span className="font-mono-tabular">{meterId}</span>
        </div>
        <button
          type="button"
          onClick={onOpenAccountModal}
          className="mt-3 w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-[#0F172A] bg-slate-50 border border-slate-200 rounded-md hover:bg-slate-100 transition-colors whitespace-nowrap"
        >
          <UserCheck className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
          <span>Switch / Manage Account</span>
        </button>
      </div>
    </div>
  );

  return (
    <>
      <aside className="hidden lg:block shrink-0 sticky top-0 h-screen">{navContent}</aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-900/35"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <aside className="relative z-50 h-full">{navContent}</aside>
        </div>
      )}
    </>
  );
}
