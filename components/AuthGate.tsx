import React from 'react';
import { useWorker } from '../contexts/WorkerContext';
import LoginPage from './LoginPage';
import RegisterPage from './RegisterPage';

interface AuthGateProps {
  children: React.ReactNode;
}

function isPublicPath(path: string): boolean {
  return path === '/' || path === '/market' || path.startsWith('/property/');
}

/**
 * Session is the source of truth. Public-first: guests see Marketplace on / and /market.
 * - session === undefined → still determining (Reconnecting…)
 * - session === null → signed out → Login/Register on protected paths, or render app on public paths
 * - session exists → render app (children)
 */
export default function AuthGate({ children }: AuthGateProps) {
  const { session } = useWorker();
  const pathname = typeof window !== 'undefined' ? window.location.pathname : '';
  const search = typeof window !== 'undefined' ? window.location.search : '';
  const isRegister = pathname === '/register';

  if (session === undefined) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#0D1117] text-gray-400">
        <div className="text-white mb-2">Reconnecting…</div>
        <div className="text-sm">Checking session…</div>
      </div>
    );
  }

  if (session === null) {
    if (isRegister) {
      return (
        <RegisterPage
          onRegisterSuccess={() => {
            window.history.pushState({}, '', '/account');
          }}
        />
      );
    }
    if (isPublicPath(pathname)) {
      return <>{children}</>;
    }
    const redirectTo = (pathname + search) || '/account';
    return <LoginPage redirectTo={redirectTo} />;
  }

  return <>{children}</>;
}
