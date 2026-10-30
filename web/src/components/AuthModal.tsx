import { useEffect, useState } from 'react';
import { ShieldCheck, X, AlertCircle, ArrowRight, Gift } from 'lucide-react';
import { useAuth } from './AuthContext';
import { Button, Input } from './ui';

export function AuthModal() {
  const { isAuthOpen, authMode, authNotice, closeAuth, login, register } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [loginField, setLoginField] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authMode) setMode(authMode);
  }, [authMode, isAuthOpen]);

  if (!isAuthOpen) return null;

  const currentMode = mode;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (currentMode === 'login') {
        await login(loginField.trim(), password);
      } else {
        await register(email.trim(), username.trim(), password);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-ink-950/80 backdrop-blur-sm transition-opacity" onClick={closeAuth} />

      {/* Modal Dialog */}
      <div className="relative w-full max-w-md rounded-2xl border border-white/10 bg-ink-900 p-6 shadow-2xl transition-all">
        {/* Close Button */}
        <button
          onClick={closeAuth}
          className="absolute right-4 top-4 rounded-lg p-1.5 text-ink-400 hover:bg-white/5 hover:text-ink-100 transition-colors"
        >
          <X className="size-5" />
        </button>

        {/* Header / Brand */}
        <div className="mb-5 flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-acid-500/10 border border-acid-500/20 text-acid-400">
            {authNotice ? <Gift className="size-5" /> : <ShieldCheck className="size-5" />}
          </div>
          <div>
            <h2 className="text-lg font-bold text-ink-100">
              {currentMode === 'login' ? 'Welcome Back' : 'Create an Account'}
            </h2>
            <p className="text-xs text-ink-400">
              {currentMode === 'login' ? 'Sign in to access your digital vault' : 'Register to buy gift cards and view codes'}
            </p>
          </div>
        </div>

        {/* Notice for Gift Card restriction */}
        {authNotice && (
          <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-amber-400/20 bg-amber-400/8 p-3 text-xs text-amber-200">
            <AlertCircle className="mt-0.5 size-4 shrink-0 text-amber-400" />
            <p className="leading-relaxed">{authNotice}</p>
          </div>
        )}

        {error && (
          <div className="mb-4 flex items-center gap-2 rounded-xl border border-flare-500/20 bg-flare-500/10 p-3 text-xs text-flare-400">
            <AlertCircle className="size-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-3.5">
          {currentMode === 'login' ? (
            <>
              <Input
                label="Email or Username"
                name="loginField"
                type="text"
                value={loginField}
                onChange={(e) => setLoginField(e.target.value)}
                placeholder="name@example.com or username"
                required
                autoFocus
              />
              <Input
                label="Password"
                name="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </>
          ) : (
            <>
              <Input
                label="Email Address"
                name="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                required
                autoFocus
              />
              <Input
                label="Username"
                name="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="gamer_tag"
                required
              />
              <Input
                label="Password (min 6 chars)"
                name="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </>
          )}

          <Button type="submit" size="md" className="w-full mt-2" loading={loading}>
            <span>{currentMode === 'login' ? 'Sign In' : 'Create Account'}</span>
            <ArrowRight className="ml-1.5 size-4" />
          </Button>
        </form>

        {/* Mode Toggle Footer */}
        <div className="mt-5 border-t border-white/5 pt-4 text-center text-xs text-ink-400">
          {currentMode === 'login' ? (
            <span>
              Don't have an account?{' '}
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setMode('register');
                }}
                className="font-semibold text-acid-400 hover:underline"
              >
                Register now
              </button>
            </span>
          ) : (
            <span>
              Already have an account?{' '}
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setMode('login');
                }}
                className="font-semibold text-acid-400 hover:underline"
              >
                Sign in
              </button>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
