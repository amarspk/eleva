import { CanActivate, ExecutionContext, Injectable, Logger } from '@nestjs/common';
import { WsException } from '@nestjs/websockets';
import { Socket } from 'socket.io';
import { AuthenticatedUser } from '../../common/types/request.types';

interface AuthenticatedSocket extends Socket {
  data: {
    user?: AuthenticatedUser;
    tenantId?: string;
  };
}

@Injectable()
export class WsJwtAuthGuard implements CanActivate {
  private readonly logger = new Logger(WsJwtAuthGuard.name);

  canActivate(context: ExecutionContext): boolean {
    const client = context.switchToWs().getClient<AuthenticatedSocket>();
    const user = client.data?.user;

    if (!user || !user.tenantId) {
      this.logger.warn(`WsJwtAuthGuard: Rejecting unauthenticated socket ${client.id}`);
      throw new WsException('Unauthorized: Socket not authenticated');
    }

    // Attach tenantId to execution context for downstream use
    // Never trust tenantId from client payload, resolved from auth only
    return true;
  }
}
