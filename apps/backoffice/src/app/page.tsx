'use client';
/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars, curly */

import React, { useEffect, useState } from 'react';
import { AdminPanel } from './components/AdminPanel';
import { RestaurantCreationWizard } from './components/RestaurantCreationWizard';

export default function Page(): React.ReactNode {
  const [branchId, setBranchId] = useState('branch-uuid-1234');
  const [tenantId, setTenantId] = useState('tenant-uuid-1111');
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    setAuthed(!!token);

    const params = new URLSearchParams(window.location.search);
    const branchParam = params.get('branchId');
    if (branchParam) setBranchId(branchParam);
  }, []);

  if (authed === null) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500 text-sm">Loading...</p>
      </div>
    );
  }

  if (!authed) {
    return <RestaurantCreationWizard />;
  }

  return (
    <div>
      <AdminPanel tenantId={tenantId} initialBranchId={branchId} />
    </div>
  );
}
