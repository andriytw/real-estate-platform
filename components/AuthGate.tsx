import React, { useState, useEffect } from 'react';
import { useWorker } from '../contexts/WorkerContext';
import { isClientDebugLogsEnabled } from '../lib/clientDebug';
import LoginPage from './LoginPage';
import RegisterPage from './RegisterPage';

interface AuthGateProps {
  children: React.ReactNode;
}

function isPublicPath(path: string): boolean {
  return path === '/' || path === '/market' || path.startsWith('/property/');
}

/** When user opens /account (or children) without session: redirect to /market and set pendingRedirect so app opens login modal. */
function RedirectAccountToMarket({ onRedirectDone }: { onRedirectDone?: () => void }) {
  useEffect(() => {
    window.history.replaceState(null, '', '/market');
    sessionStorage.setItem('pendingRedirect', '/account');
    onRedirectDone?.();
  }, [onRedirectDone]);
  return null;
}

/**
 * Session is the source of truth. Public-first: guests see Marketplace on / and /market.
 * - session === undefined → still determining (Reconnecting…)
 * - session === null → signed out → Login/Register on protected paths, or render app on public paths
 * - session exists → render app (children)
 */
export default function AuthGate({ children }: AuthGateProps) {
  const { session } = useWorker();
  const [navTick, setNavTick] = useState(0);

  useEffect(() => {
    const onPopState = () => setNavTick((t) => t + 1);
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

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
    if (isClientDebugLogsEnabled() && pathname.startsWith('/account')) {
      try {
        const e = {
          t: Date.now(),
          loc: 'AuthGate:NULL',
          msg: 'session=null on /account - UNMOUNTING app tree',
          pathname,
        };
        console.warn('[DBG-978438]', JSON.stringify(e));
        try {
          const a = JSON.parse(localStorage.getItem('__dbg978438') || '[]');
          a.push(e);
          localStorage.setItem('__dbg978438', JSON.stringify(a.slice(-60)));
        } catch {
          /* ignore */
        }
      } catch {
        /* ignore */
      }
    }
    if (isRegister) {
      return (
        <RegisterPage
          onRegisterSuccess={() => {
            window.history.pushState({}, '', '/account');
          }}
        />
      );
    }
    if (pathname.startsWith('/account')) {
      return <RedirectAccountToMarket onRedirectDone={() => setNavTick((t) => t + 1)} />;
    }
    if (isPublicPath(pathname)) {
      return <>{children}</>;
    }
    const redirectTo = (pathname + search) || '/account';
    return <LoginPage redirectTo={redirectTo} />;
  }

  return <>{children}</>;
}
