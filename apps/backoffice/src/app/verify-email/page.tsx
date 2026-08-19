'use client';

import React, { Suspense } from 'react';
import { VerifyEmailForm } from '../components/VerifyEmailForm';

export default function VerifyEmailPage(): React.ReactElement {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-950" />}>
      <VerifyEmailForm />
    </Suspense>
  );
}
