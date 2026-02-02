import React from 'react';
import { useWorker } from '../contexts/WorkerContext';
import LoginPage from './LoginPage';
import RegisterPage from './RegisterPage';

interface AuthGateProps {
  children: React.ReactNode;
}

/**
 * Session is the source of truth. No login shown due to timeout.
 * - session === undefined → still determining (Loading / Reconnecting…)
 * - session === null → signed out → Login or Register
 * - session exists → render app (children)
 */
export default function AuthGate({ children }: AuthGateProps) {
  const { session } = useWorker();
  const isRegister = typeof window !== 'undefined' && window.location.pathname === '/register';

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
    return (
      <LoginPage
        onLoginSuccess={async () => {
          window.history.pushState({}, '', '/account');
        }}
      />
    );
  }

  return <>{children}</>;
}
