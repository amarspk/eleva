'use client';

import React from 'react';
import { ElevaTower } from '../components/ElevaTower';

/**
 * ELEVA Tower — the official ELEVA Brand & Marketing Platform.
 *
 * This route is the public marketing entry point: exterior → reception →
 * elevator login. Business logic (auth, RBAC, tenants) stays server-side.
 */
export default function ElevaPage(): React.ReactNode {
  return <ElevaTower />;
}