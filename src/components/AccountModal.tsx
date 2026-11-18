import { useState } from 'react';
import { X } from 'lucide-react';
import { UserAccount } from '../types/api';
import { api } from '../utils/apiClient';

interface AccountModalProps {
  open: boolean;
  onClose: () => void;
  users: UserAccount[];
  activeUser: UserAccount;
  onSelectUser: (user: UserAccount) => void;
  onUserCreated: (user: UserAccount) => void;
}

export function AccountModal({
  open,
  onClose,
  users,
  activeUser,
  onSelectUser,
  onUserCreated,
}: AccountModalProps) {
  const [tab, setTab] = useState<'switch' | 'login' | 'register'>('switch');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [householdName, setHouseholdName] = useState('');
  const [householdSize, setHouseholdSize] = useState('3');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!open) return null;

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const res = await api.login(email, password);
      onSelectUser(res.user);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const res = await api.register({
        name,
        email,
        password,
        householdName,
        householdSize: Number(householdSize) || 2,
      });
      onUserCreated(res.user);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="account-modal-title"
    >
      <div className="bg-white border border-slate-200 rounded-lg w-full max-w-lg p-6">
        <div className="flex items-center justify-between pb-4 border-b border-slate-200">
          <div>
            <h2 id="account-modal-title" className="font-display text-lg font-semibold text-[#0F172A]">
              Account & Household Isolation
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Each user accesses only their own water readings, alerts, and goals in SQLite.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close account modal"
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-md"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-md mt-4">
          <button
            type="button"
            onClick={() => {
              setTab('switch');
              setError('');
            }}
            className={`flex-1 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap ${
              tab === 'switch' ? 'bg-white text-[#0F172A] shadow-xs' : 'text-slate-600 hover:text-[#0F172A]'
            }`}
          >
            Existing Accounts
          </button>
          <button
            type="button"
            onClick={() => {
              setTab('login');
              setError('');
            }}
            className={`flex-1 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap ${
              tab === 'login' ? 'bg-white text-[#0F172A] shadow-xs' : 'text-slate-600 hover:text-[#0F172A]'
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => {
              setTab('register');
              setError('');
            }}
            className={`flex-1 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap ${
              tab === 'register' ? 'bg-white text-[#0F172A] shadow-xs' : 'text-slate-600 hover:text-[#0F172A]'
            }`}
          >
            Create Account
          </button>
        </div>

        {error && (
          <div className="mt-4 p-3 text-xs text-[#DC2626] bg-red-50 border border-red-200 rounded-md" role="alert">
            {error}
          </div>
        )}

        {tab === 'switch' && (
          <div className="mt-4 space-y-2.5 max-h-72 overflow-y-auto">
            {users.map((u) => {
              const isCurrent = u.id === activeUser.id;
              return (
                <div
                  key={u.id}
                  className={`flex items-center justify-between p-3 border rounded-md ${
                    isCurrent ? 'border-[#0F766E] bg-[#F0FDFA]' : 'border-slate-200 bg-white'
                  }`}
                >
                  <div className="min-w-0 pr-3">
                    <div className="text-sm font-semibold text-[#0F172A] truncate">{u.householdName}</div>
                    <div className="text-xs text-slate-500 truncate">
                      {u.name} · {u.email} · {u.householdSize} occupants
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={isCurrent}
                    aria-label={isCurrent ? `${u.householdName} (active)` : `Switch to ${u.householdName}`}
                    onClick={() => {
                      onSelectUser(u);
                      onClose();
                    }}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap shrink-0 ${
                      isCurrent
                        ? 'bg-[#0F766E] text-white cursor-default'
                        : 'bg-slate-900 text-white hover:bg-slate-800'
                    }`}
                  >
                    {isCurrent ? 'Active' : 'Select'}
                  </button>
                </div>
              );
            })}
            <p className="text-xs text-slate-500 pt-1">
              Demo credentials for Sign In tab: <span className="font-mono-tabular">alex@aqualedger.edu</span> or{' '}
              <span className="font-mono-tabular">priya@aqualedger.edu</span> (password:{' '}
              <span className="font-mono-tabular">demo123</span>).
            </p>
          </div>
        )}

        {tab === 'login' && (
          <form onSubmit={handleLogin} className="mt-4 space-y-3">
            <div>
              <label htmlFor="login-email" className="block text-xs font-medium text-slate-700 mb-1">
                Email Address
              </label>
              <input
                id="login-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="alex@aqualedger.edu"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:border-[#0F766E]"
              />
            </div>
            <div>
              <label htmlFor="login-password" className="block text-xs font-medium text-slate-700 mb-1">
                Password
              </label>
              <input
                id="login-password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="demo123"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:border-[#0F766E]"
              />
            </div>
            <div className="pt-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-medium text-slate-700 border border-slate-200 rounded-md hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 text-xs font-medium text-white bg-[#0F766E] rounded-md hover:bg-[#0D625B] disabled:opacity-50"
              >
                {submitting ? 'Signing In...' : 'Sign In'}
              </button>
            </div>
          </form>
        )}

        {tab === 'register' && (
          <form onSubmit={handleRegister} className="mt-4 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="reg-name" className="block text-xs font-medium text-slate-700 mb-1">
                  Full Name
                </label>
                <input
                  id="reg-name"
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Jordan Lee"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:border-[#0F766E]"
                />
              </div>
              <div>
                <label htmlFor="reg-size" className="block text-xs font-medium text-slate-700 mb-1">
                  Occupants
                </label>
                <input
                  id="reg-size"
                  type="number"
                  min={1}
                  max={20}
                  required
                  value={householdSize}
                  onChange={(e) => setHouseholdSize(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:border-[#0F766E]"
                />
              </div>
            </div>
            <div>
              <label htmlFor="reg-household" className="block text-xs font-medium text-slate-700 mb-1">
                Household Name
              </label>
              <input
                id="reg-household"
                type="text"
                required
                value={householdName}
                onChange={(e) => setHouseholdName(e.target.value)}
                placeholder="Lee Residence"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:border-[#0F766E]"
              />
            </div>
            <div>
              <label htmlFor="reg-email" className="block text-xs font-medium text-slate-700 mb-1">
                Email Address
              </label>
              <input
                id="reg-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="jordan@example.edu"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:border-[#0F766E]"
              />
            </div>
            <div>
              <label htmlFor="reg-password" className="block text-xs font-medium text-slate-700 mb-1">
                Password (min 4 chars)
              </label>
              <input
                id="reg-password"
                type="password"
                minLength={4}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:border-[#0F766E]"
              />
            </div>
            <div className="pt-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-medium text-slate-700 border border-slate-200 rounded-md hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 text-xs font-medium text-white bg-[#0F766E] rounded-md hover:bg-[#0D625B] disabled:opacity-50"
              >
                {submitting ? 'Creating...' : 'Create Account'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
