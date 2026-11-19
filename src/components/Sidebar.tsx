import {
  AlertTriangle,
  BarChart3,
  Droplets,
  FileText,
  Home,
  Leaf,
  TrendingUp,
  User,
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

const NAV_ITEMS: Array<{ id: PageId; label: string; icon: typeof Home }> = [
  { id: 'dashboard', label: 'Dashboard', icon: Home },
  { id: 'monitoring', label: 'Water Usage', icon: BarChart3 },
  { id: 'prediction', label: 'Usage Prediction', icon: TrendingUp },
  { id: 'leaks', label: 'Leak Detection', icon: AlertTriangle },
  { id: 'conservation', label: 'Water Conservation', icon: Leaf },
  { id: 'reports', label: 'Reports', icon: FileText },
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
    <div className="flex flex-col h-full bg-[#FBFBFC] border-r border-slate-200/90 w-[248px]">
      <div className="h-16 px-5 flex items-center justify-between border-b border-slate-200/80 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-7 h-7 rounded-md bg-[#0F766E] flex items-center justify-center text-white shadow-xs shrink-0">
            <Droplets className="w-4 h-4" aria-hidden="true" />
          </div>
          <span className="font-display font-semibold text-[15px] tracking-tight text-[#0F172A] whitespace-nowrap">
            AquaLedger
          </span>
        </div>
        <button
          type="button"
          onClick={onCloseMobile}
          aria-label="Close navigation menu"
          className="lg:hidden p-1.5 text-slate-500 hover:text-slate-900 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F766E]/30"
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
              className={`w-full flex items-center justify-between px-3 py-2 text-[13px] rounded-md whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F766E]/30 ${
                isActive
                  ? 'bg-white text-[#0F172A] font-semibold border border-slate-200/90 shadow-[0_1px_2px_rgba(15,23,42,0.05)]'
                  : 'text-slate-600 font-medium border border-transparent hover:bg-slate-100/70 hover:text-[#0F172A]'
              }`}
            >
              <span className="flex items-center gap-2.5 min-w-0">
                <Icon
                  className={`w-4 h-4 shrink-0 ${
                    isActive ? 'text-[#0F766E]' : 'text-slate-400'
                  }`}
                  aria-hidden="true"
                />
                <span className="truncate">{item.label}</span>
              </span>
              {item.id === 'leaks' && activeAlertCount > 0 && (
                <span className="font-mono-tabular text-xs font-semibold text-[#DC2626] shrink-0">
                  {activeAlertCount}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="p-4 border-t border-slate-200/80 bg-white/70 shrink-0">
        <div className="text-[11px] font-medium text-slate-400">Current Home</div>
        <div className="text-sm font-semibold text-[#0F172A] truncate mt-0.5">
          {user.householdName}
        </div>
        <div className="text-xs text-slate-500 truncate mt-0.5">
          {user.name} · <span className="font-mono-tabular">{meterId}</span>
        </div>
        <button
          type="button"
          onClick={onOpenAccountModal}
          className="mt-3 w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md shadow-2xs hover:bg-slate-50 hover:border-slate-300 whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F766E]/30"
        >
          <User className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
          <span>Switch Home</span>
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
            className="fixed inset-0 bg-slate-900/35 backdrop-blur-[1px]"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <aside className="relative z-50 h-full shadow-xl">{navContent}</aside>
        </div>
      )}
    </>
  );
}
