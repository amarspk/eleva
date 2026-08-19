'use client';

import React, { Suspense } from 'react';
import { ResetPasswordForm } from '../components/ResetPasswordForm';

export default function ResetPasswordPage(): React.ReactElement {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-950" />}>
      <ResetPasswordForm />
    </Suspense>
  );
}
