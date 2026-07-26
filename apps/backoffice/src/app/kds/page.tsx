'use client';
/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars, curly, no-console */

import React, { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';

const KDSTerminal = dynamic(() => import('../components/KDSTerminal'), {
  loading: () => <div className="flex items-center justify-center h-64">Loading KDS Terminal...</div>,
  ssr: false
});

export default function KDSPage(): React.ReactNode {
  const [branchId, setBranchId] = useState('branch-uuid-1234');
  const [accessToken, setAccessToken] = useState('mock-jwt-token-for-dev');
  const [tenantId, setTenantId] = useState('tenant-uuid-1111');

  useEffect(() => {
    const host = window.location.hostname;
    const subdomain = host.split('.')[0];
    console.log(`Backoffice KDS Page loaded for subdomain: ${subdomain}`);
    const params = new URLSearchParams(window.location.search);
    const branchParam = params.get('branchId');
    if (branchParam) setBranchId(branchParam);
    const token = localStorage.getItem('accessToken') || 'mock-jwt-token-for-dev';
    setAccessToken(token);
  }, []);

  return (
    <div>
      <KDSTerminal branchId={branchId} accessToken={accessToken} tenantId={tenantId} />
    </div>
  );
}
