import { Request } from 'express';

export interface AuthenticatedUser {
  id: string;
  email: string;
  tenantId: string | null;
  roles: string[];
  permissions: string[];
  branches?: string[];
}

export interface JwtPayload {
  sub: string;
  email: string;
  tenantId: string | null;
  roles: string[];
  permissions: string[];
  iat?: number;
  exp?: number;
}

export interface AuthenticatedRequest extends Request {
  user: AuthenticatedUser;
  tenantId?: string | null;
  correlationId?: string;
}

export interface RequestWithTenant extends Request {
  tenantId?: string | null;
  correlationId?: string;
}
