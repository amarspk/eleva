'use client';

import React, { useEffect, useState } from 'react';
import { BackofficeShell } from './components/BackofficeShell';
import { ElevaTower } from './components/ElevaTower';
import { loadSession } from './lib/auth';

/**
 * ELEVA entry point.
 *
 * Unauthenticated visitors land on the ELEVA Tower (exterior → reception →
 * elevator login). Authenticated users go straight to their office
 * (the BackofficeShell). Tenant context comes from the verified session.
 */
export default function Page(): React.ReactNode {
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    try {
      const session = loadSession();
      setAuthed(!!session?.accessToken);
    } catch {
      setAuthed(false);
    }
  }, []);

  if (authed === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950">
        <p className="text-sm text-slate-400">Entering the ELEVA Tower…</p>
      </div>
    );
  }

  return authed ? <BackofficeShell /> : <ElevaTower />;
}