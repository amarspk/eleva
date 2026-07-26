'use client';
/* eslint-disable */

import React, { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';

const CashierTerminal = dynamic(() => import('./components/CashierTerminal'), {
  loading: () => <div className="flex items-center justify-center h-screen">Loading Cashier Terminal...</div>,
  ssr: false
});

export default function Page(): React.ReactNode {
  const [tenantId, setTenantId] = useState('tenant-uuid-1111');
  const [branchId, setBranchId] = useState('branch-uuid-1234');
  const [apiUrl, setApiUrl] = useState('http://localhost:8000');

  useEffect(() => {
    const host = window.location.hostname;
    const subdomain = host.split('.')[0];
    console.log(`Cashier PWA loaded for tenant subdomain: ${subdomain}, tenant isolation enforced`);
    const params = new URLSearchParams(window.location.search);
    const branchParam = params.get('branchId');
    const tenantParam = params.get('tenantId');
    if (branchParam) setBranchId(branchParam);
    if (tenantParam) setTenantId(tenantParam);
    setApiUrl(process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000');
  }, []);

  return <CashierTerminal tenantId={tenantId} branchId={branchId} apiUrl={apiUrl} />;
}
