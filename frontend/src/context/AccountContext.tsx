import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { accountRequest, setAccountMode, type AccountUser } from '../api/account.js';
type AccountContextValue = {
  user: AccountUser | null; guest: boolean;
  showAuth: (mode: 'signin' | 'signup') => void;
  signOut: () => Promise<void>;
  saveProfile: (profile: Pick<AccountUser, 'name' | 'goals' | 'skillLevel'>) => Promise<void>;
};
const AccountContext = createContext<AccountContextValue | null>(null);
export function useAccount() { return useContext(AccountContext)!; }
const inputClass = 'w-full rounded-lg border border-white/20 bg-[#10191e] px-4 py-3 text-white';
export function AccountProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AccountUser | null>(null);
  const [guest, setGuest] = useState(false);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  useEffect(() => {
    accountRequest<{ user: AccountUser | null }>().then(result => {
      setAccountMode(!!result.user, result.user?.id); setUser(result.user);
      if (!result.user) { const isGuest = sessionStorage.getItem('hoopcoach-guest') === 'true'; setGuest(isGuest); setOpen(!isGuest); }
    }).catch(err => { setError(err.message); setOpen(true); }).finally(() => setLoading(false));
  }, []);
  function enterGuest() { setAccountMode(false); setGuest(true); sessionStorage.setItem('hoopcoach-guest', 'true'); setOpen(false); setError(''); }
  async function signOut() {
    await accountRequest({ action: 'signout' });
    setAccountMode(false); setUser(null); setGuest(false); sessionStorage.removeItem('hoopcoach-guest'); setOpen(true); setError('');
  }
  async function saveProfile(profile: Pick<AccountUser, 'name' | 'goals' | 'skillLevel'>) {
    if (user) { const result = await accountRequest<{ user: AccountUser }>({ action: 'profile', profile }); setUser(result.user); }
    else { localStorage.setItem('hoopcoach-guest-profile', JSON.stringify(profile)); }
  }
  if (loading) return <div className="grid min-h-screen place-items-center bg-[#070b0d] text-white" role="status">Loading your account…</div>;
  return <AccountContext.Provider value={{ user, guest, signOut, saveProfile, showAuth: next => { setMode(next); setError(''); setOpen(true); } }}>
    {(user || guest) && <div key={user?.id || 'guest'}>{children}</div>}
    {open && <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-[#070b0d]/95 p-5" role="dialog" aria-modal="true" aria-labelledby="account-title">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0b1114] p-7 text-white shadow-xl">
        <p className="mb-6 text-xl font-extrabold">🏀 HoopCoach AI</p>
        <h1 id="account-title" className="text-3xl font-extrabold">{mode === 'signup' ? 'Create your account' : 'Welcome back'}</h1>
        <p className="mt-3 text-sm leading-6 text-slate-400">Save your workouts, player profile, history, and progress across devices.</p>
        <div className="my-5 grid grid-cols-2 gap-2">
          {(['signin','signup'] as const).map(value => <button key={value} aria-pressed={mode === value} disabled={busy} onClick={() => { setMode(value); setShowPassword(false); setError(''); }} className={`rounded-lg py-2 font-bold ${mode === value ? 'bg-orange-600' : 'bg-white/5'}`}>{value === 'signin' ? 'Sign in' : 'Sign up'}</button>)}
        </div>
        <form key={mode} className="grid gap-4" onSubmit={async event => {
          event.preventDefault(); const form = new FormData(event.currentTarget); setBusy(true); setError('');
          try {
            const result = await accountRequest<{ user: AccountUser }>({ action: mode, name: form.get('name'), email: form.get('email'), password: form.get('password') });
            setAccountMode(true, result.user.id); setUser(result.user); setGuest(false); sessionStorage.removeItem('hoopcoach-guest'); setOpen(false);
          } catch (err) { setError(err instanceof Error ? err.message : 'Could not sign in.'); } finally { setBusy(false); }
        }}>
          {mode === 'signup' && <label className="grid gap-2 text-sm font-bold">Name<input autoFocus name="name" required maxLength={100} autoComplete="name" className={inputClass} /></label>}
          <label className="grid gap-2 text-sm font-bold">Email<input autoFocus={mode === 'signin'} name="email" type="email" required maxLength={254} autoComplete="email" className={inputClass} /></label>
          <label className="grid gap-2 text-sm font-bold">Password<input name="password" type={showPassword ? 'text' : 'password'} required minLength={10} maxLength={128} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} className={inputClass} /></label>
          <label className="flex items-center gap-2 text-sm text-slate-300"><input type="checkbox" checked={showPassword} onChange={event => setShowPassword(event.target.checked)} />Show password</label>
          <p className="text-xs text-slate-400">Use at least 10 characters.</p>
          {error && <p role="alert" className="text-sm text-orange-300">{error}</p>}
          <button disabled={busy} className="rounded-lg bg-orange-600 px-4 py-3 font-extrabold disabled:opacity-50">{busy ? 'Please wait…' : mode === 'signup' ? 'Create account' : 'Sign in to your account'}</button>
        </form>
        {!user && <button disabled={busy} className="mt-4 w-full rounded-lg border border-white/20 px-4 py-3 font-bold disabled:opacity-50" onClick={enterGuest}>Continue as guest</button>}
        <p className="mt-3 text-center text-xs leading-5 text-slate-400">Guest data stays in this browser. Account data is saved separately.</p>
        {(user || guest) && <button disabled={busy} onClick={() => setOpen(false)} className="mt-3 w-full text-sm text-slate-300">Back to training</button>}
      </div>
    </div>}
  </AccountContext.Provider>;
}
