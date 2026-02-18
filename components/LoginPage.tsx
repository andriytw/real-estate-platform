import React, { useState, useEffect } from 'react';
import { LogIn, Mail, Lock, AlertCircle } from 'lucide-react';
import { useWorker } from '../contexts/WorkerContext';

interface LoginPageProps {
  redirectTo?: string;
  onLoginSuccess?: () => void;
}

const LoginPage: React.FC<LoginPageProps> = ({ redirectTo = '/account', onLoginSuccess }) => {
  const { login, loading } = useWorker();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email || !password) {
      setError('Будь ласка, заповніть всі поля');
      return;
    }

    try {
      await login(email, password);
      await new Promise(resolve => setTimeout(resolve, 500));
      const target = redirectTo || '/account';
      window.history.pushState({}, '', target);
      window.dispatchEvent(new Event('popstate'));
      onLoginSuccess?.();
    } catch (err: any) {
      console.error('❌ LoginPage: Login error:', err);
      setError(err.message || 'Помилка входу. Перевірте email та пароль.');
    }
  };

  return (
    <div className="min-h-screen bg-[#0D0F11] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-[#1C1F24] rounded-lg border border-gray-800 p-8 shadow-2xl">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-emerald-500/10 rounded-full mb-4">
              <LogIn className="w-8 h-8 text-emerald-500" />
            </div>
            <h1 className="text-2xl font-bold text-white mb-2">Вхід в систему</h1>
            <p className="text-gray-400 text-sm">Введіть ваші облікові дані</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                <p className="text-red-400 text-sm">{error}</p>
              </div>
            )}

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-2">
                Email
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-[#0D0F11] border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                  placeholder="your@email.com"
                  required
                  disabled={loading}
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-300 mb-2">
                Пароль
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-[#0D0F11] border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                  placeholder="••••••••"
                  required
                  disabled={loading}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-emerald-500 hover:bg-emerald-600 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>Вхід...</span>
                </>
              ) : (
                <>
                  <LogIn className="w-5 h-5" />
                  <span>Увійти</span>
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;



