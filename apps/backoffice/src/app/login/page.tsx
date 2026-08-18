'use client';

import React from 'react';
import { ElevaElevator } from '../components/ElevaElevator';

/**
 * ELEVA Tower — Elevator login.
 *
 * Authentication happens inside the elevator experience. The server alone
 * decides identity, role, restaurant and destination floor; the user is never
 * asked to pick a role. After success the elevator animates and the router
 * moves the user into their authorized office.
 */
export default function LoginPage(): React.ReactNode {
  return <ElevaElevator />;
}