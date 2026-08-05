'use client';

import React, { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { loadSession } from '../lib/auth';

const KDSTerminal = dynamic(() => import('../components/KDSTerminal'), {
  loading: () => <div className="flex items-center justify-center h-64">Loading KDS Terminal...</div>,
  ssr: false,
});

export default function KDSPage(): React.ReactNode {
  const [branchId, setBranchId] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [tenantId, setTenantId] = useState('');

  useEffect(() => {
    const session = loadSession();
    if (session?.accessToken) {
      setAccessToken(session.accessToken);
    }
    if (session?.tenantId) {
      setTenantId(session.tenantId);
    }
    const params = new URLSearchParams(window.location.search);
    const branchParam = params.get('branchId');
    if (branchParam) {
      setBranchId(branchParam);
    }
  }, []);

  return (
    <div>
      <KDSTerminal branchId={branchId} accessToken={accessToken} tenantId={tenantId} />
    </div>
  );
}
