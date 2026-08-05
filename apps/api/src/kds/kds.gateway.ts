import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
} from '@nestjs/websockets';
import { Logger, OnModuleDestroy } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Server, Socket } from 'socket.io';
import { createClient, RedisClientType } from 'redis';
import { createAdapter } from '@socket.io/redis-adapter';
import { JWT_CONFIG } from '../auth/config/jwt.config';
import { AuthService } from '../auth/auth.service';
import { TenantBranchRepository, dbTenantContext } from '@zayjar/db';

/**
 * Dedicated WebSocket Gateway for Real-Time Kitchen Display System (KDS)
 * Implements TSK-2.1 requirements:
 * - Socket.IO
 * - Scoped by tenantId and branchId
 * - Rooms: tenant:{tenantId}:branch:{branchId}
 * - JWT protected, tenant isolation
 * - Redis adapter (SPEC_INDEX §7.6) so events broadcast across multiple API
 *   pods (k8s HPA scales the API 2–10) — each pod shares the same Redis
 *   pub/sub bus, so a room broadcast reaches clients connected to any pod.
 */

interface AuthenticatedUser {
  id: string;
  email: string;
  tenantId: string;
  roles: string[];
  permissions: string[];
}

interface AuthenticatedSocket extends Socket {
  data: {
    user?: AuthenticatedUser;
    tenantId?: string;
  };
}

interface BroadcastPayload {
  id?: string;
  orderNumber?: string;
  [key: string]: unknown;
}

interface JwtPayload {
  sub: string;
  email: string;
  tenantId: string | null;
  roles: string[];
  permissions: string[];
  iat?: number;
  exp?: number;
}

@WebSocketGateway({
  namespace: '/kds',
  cors: {
    origin: '*',
    credentials: true,
  },
  transports: ['websocket', 'polling'],
})
export class KdsGateway
  implements OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit, OnModuleDestroy
{
  private readonly logger = new Logger(KdsGateway.name);

  /* When ENABLE_SOCKET_IO is not set (e.g. on Render free tier to save
     memory), the gateway skips Redis adapter setup and WebSocket init.
     The REST KDS controller still works — only real-time push is disabled. */
  private readonly socketIoEnabled = process.env.ENABLE_SOCKET_IO !== 'false';
  @WebSocketServer()
  public server!: Server;

  private readonly branchRepository = new TenantBranchRepository();

  private pubClient: RedisClientType | null = null;
  private subClient: RedisClientType | null = null;
  private redisAdapterAttached = false;

  /**
   * Attaches the Socket.io Redis adapter (SPEC_INDEX §7.6) so KDS room
   * broadcasts are delivered across all API pods sharing Redis.
   *
   * Redis URL resolution: `SOCKET_IO_REDIS_URL` if set, else `REDIS_URL`.
   * If Redis is not configured or unreachable, the gateway logs a warning and
   * keeps the default in-memory adapter — single-pod/local behavior is
   * unchanged (no hard failure, no crash loop).
   */
  async afterInit(_server: Server): Promise<void> {
    if (!this.socketIoEnabled) {
      this.logger.warn('Socket.IO disabled (ENABLE_SOCKET_IO=false) — KDS real-time push inactive. REST API still available.');
      return;
    }

    const redisUrl = process.env.SOCKET_IO_REDIS_URL || process.env.REDIS_URL;
    if (!redisUrl) {
      this.logger.warn(
        'Socket.io Redis adapter disabled (no SOCKET_IO_REDIS_URL/REDIS_URL set) — using the in-memory adapter. Cross-pod KDS broadcast requires Redis.',
      );
      return;
    }
    try {
      const useTls = process.env.REDIS_TLS === 'true';
      const clientOptions: Record<string, unknown> = { url: redisUrl };
      if (useTls) {
        clientOptions.socket = { tls: true, rejectUnauthorized: false };
      }
      const pubClient = createClient(clientOptions);
      const subClient = pubClient.duplicate();
      pubClient.on('error', (err) => this.logger.error(`[KDS Redis pub] ${err.message}`));
      subClient.on('error', (err) => this.logger.error(`[KDS Redis sub] ${err.message}`));
      await Promise.all([pubClient.connect(), subClient.connect()]);

      this.pubClient = pubClient;
      this.subClient = subClient;
      this.server.adapter(createAdapter(pubClient, subClient));
      this.redisAdapterAttached = true;
      this.logger.log(`Socket.io Redis adapter attached (${redisUrl}) — cross-pod KDS broadcast enabled.`);
    } catch (err) {
      this.logger.warn(
        `Socket.io Redis adapter failed to attach (falling back to in-memory adapter): ${(err as Error).message}`,
      );
      this.redisAdapterAttached = false;
    }
  }

  /**
   * Shuts down the Redis pub/sub clients on application shutdown to avoid
   * dangling connections.
   */
  async onModuleDestroy(): Promise<void> {
    if (this.subClient) {
      await this.subClient.quit().catch(() => undefined);
    }
    if (this.pubClient) {
      await this.pubClient.quit().catch(() => undefined);
    }
    this.pubClient = null;
    this.subClient = null;
  }

  constructor(
    private readonly jwtService: JwtService,
    private readonly authService: AuthService,
  ) {}

  /**
   * Generates canonical room name scoped to tenant and branch.
   * Format: tenant:{tenantId}:branch:{branchId}
   */
  public getRoomName(tenantId: string, branchId: string): string {
    return `tenant:${tenantId}:branch:${branchId}`;
  }

  /**
   * Extract JWT token from handshake.
   * Supports: auth.token, query.token, headers.authorization Bearer
   */
  private extractToken(client: Socket): string | null {
    // 1. socket.io auth payload: client.handshake.auth.token
    const auth = client.handshake.auth as Record<string, unknown>;
    const authToken = auth?.token;
    if (authToken && typeof authToken === 'string') {
      return authToken;
    }

    // 2. Query param: ?token=...
    const query = client.handshake.query as Record<string, unknown>;
    const queryToken = query?.token;
    if (queryToken && typeof queryToken === 'string') {
      return queryToken;
    }

    // 3. Authorization header
    const header = client.handshake.headers?.authorization;
    if (header && typeof header === 'string' && header.startsWith('Bearer ')) {
      return header.split(' ')[1];
    }

    // 4. Also check handshake.headers['authorization'] as array edge case
    const authHeader = client.handshake.headers?.authorization;
    if (Array.isArray(authHeader) && authHeader[0]?.startsWith('Bearer ')) {
      return authHeader[0].split(' ')[1];
    }

    return null;
  }

  /**
   * Handle new client connection with JWT authentication.
   * Never trust tenantId from client - resolve from authenticated request (JWT payload).
   */
  async handleConnection(client: AuthenticatedSocket): Promise<void> {
    try {
      this.logger.log(`KDS client connecting: ${client.id}`);

      const token = this.extractToken(client);

      if (!token) {
        this.logger.warn(`KDS connection rejected: Missing token for client ${client.id}`);
        client.emit('error', { message: 'Authentication required: Missing JWT token' });
        client.disconnect(true);
        return;
      }

      // Verify JWT signature and expiration
      let payload: JwtPayload;
      try {
        payload = await this.jwtService.verifyAsync<JwtPayload>(token, {
          secret: JWT_CONFIG.accessTokenSecret,
        });
      } catch (err) {
        this.logger.warn(`KDS connection rejected: Invalid token for client ${client.id} - ${(err as Error).message}`);
        client.emit('error', { message: 'Invalid or expired token' });
        client.disconnect(true);
        return;
      }

      // Check token blacklist (logout revocation)
      const isBlacklisted = await this.authService.isTokenBlacklisted(token);
      if (isBlacklisted) {
        this.logger.warn(`KDS connection rejected: Blacklisted token for client ${client.id}`);
        client.emit('error', { message: 'Token has been revoked' });
        client.disconnect(true);
        return;
      }

      // Validate tenant context exists (never trust client, resolve from JWT)
      if (!payload.tenantId) {
        this.logger.warn(`KDS connection rejected: Missing tenantId in token for client ${client.id}`);
        client.emit('error', { message: 'Tenant context missing in token' });
        client.disconnect(true);
        return;
      }

      // Attach authenticated user to socket data
      const user: AuthenticatedUser = {
        id: payload.sub,
        email: payload.email,
        tenantId: payload.tenantId,
        roles: payload.roles || [],
        permissions: payload.permissions || [],
      };

      client.data.user = user;
      client.data.tenantId = user.tenantId; // resolved from authenticated request only

      this.logger.log(`KDS client authenticated: ${client.id} | tenant: ${user.tenantId} | user: ${user.id}`);
      client.emit('connected', {
        message: 'Authenticated successfully',
        tenantId: user.tenantId,
        userId: user.id,
      });
    } catch (err) {
      this.logger.error(`KDS handleConnection fatal error for ${client.id}: ${(err as Error).message}`);
      client.emit('error', { message: 'Internal authentication error' });
      client.disconnect(true);
    }
  }

  async handleDisconnect(client: AuthenticatedSocket): Promise<void> {
    const user = client.data?.user;
    this.logger.log(`KDS client disconnected: ${client.id} | tenant: ${user?.tenantId || 'unknown'}`);
  }

  /**
   * Client requests to join a branch-specific room.
   * branchId is provided by client but validated against tenant ownership.
   * tenantId is NEVER trusted from client payload - resolved from authenticated socket data.
   */
  @SubscribeMessage('joinBranch')
  async handleJoinBranch(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: { branchId?: string } | string,
  ): Promise<{ event: string; room?: string; message?: string } | void> {
    const user = client.data?.user;

    if (!user || !user.tenantId) {
      this.logger.warn(`joinBranch rejected: unauthenticated client ${client.id}`);
      client.emit('error', { message: 'Not authenticated' });
      client.disconnect(true);
      return;
    }

    // Resolve branchId from payload (support string or object)
    let branchId: string | undefined;
    if (typeof payload === 'string') {
      branchId = payload;
    } else if (payload && typeof payload === 'object') {
      branchId = payload.branchId;
    }

    if (!branchId) {
      client.emit('error', { message: 'branchId is required to join room' });
      return { event: 'error', message: 'branchId required' };
    }

    // Verify branch ownership via TenantBranchRepository within tenant context
    // Preserves tenant isolation completely
    try {
      const isValidBranch = await dbTenantContext.run(
        { tenantId: user.tenantId },
        async () => {
          const branch = await this.branchRepository.findById(branchId!);
          return !!branch;
        },
      );

      if (!isValidBranch) {
        this.logger.warn(
          `joinBranch rejected: branch ${branchId} not found for tenant ${user.tenantId} (client ${client.id})`,
        );
        client.emit('error', { message: `Branch ${branchId} not found or inaccessible under tenant context` });
        return { event: 'error', message: 'Branch not found or access denied' };
      }

      const roomName = this.getRoomName(user.tenantId, branchId);
      await client.join(roomName);

      this.logger.log(`Client ${client.id} joined room ${roomName}`);
      client.emit('joinedBranch', { room: roomName, branchId, tenantId: user.tenantId });
      return { event: 'joinedBranch', room: roomName };
    } catch (err) {
      this.logger.error(`joinBranch error for client ${client.id}: ${(err as Error).message}`);
      // If error message contains Fail-Safe Block, it means isolation violation
      const message = (err as Error).message.includes('Fail-Safe Block')
        ? 'Tenant isolation violation: Branch not accessible'
        : 'Failed to join branch room';
      client.emit('error', { message });
      return { event: 'error', message };
    }
  }

  @SubscribeMessage('leaveBranch')
  async handleLeaveBranch(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: { branchId?: string } | string,
  ): Promise<{ event: string; room?: string } | void> {
    const user = client.data?.user;
    if (!user?.tenantId) {
      client.emit('error', { message: 'Not authenticated' });
      return;
    }

    let branchId: string | undefined;
    if (typeof payload === 'string') {
      branchId = payload;
    } else {
      branchId = payload.branchId;
    }

    if (!branchId) {
      client.emit('error', { message: 'branchId required' });
      return;
    }

    const roomName = this.getRoomName(user.tenantId, branchId);
    await client.leave(roomName);
    this.logger.log(`Client ${client.id} left room ${roomName}`);
    client.emit('leftBranch', { room: roomName, branchId });
    return { event: 'leftBranch', room: roomName };
  }

  /**
   * Core broadcast logic: emits order events to scoped tenant+branch room.
   * Called automatically by OrderService whenever order status changes.
   */
  public broadcastOrderEvent(
    tenantId: string,
    branchId: string,
    eventName: string,
    payload: BroadcastPayload,
  ): void {
    if (!tenantId || !branchId) {
      this.logger.warn(`broadcastOrderEvent skipped: missing tenantId or branchId for event ${eventName}`);
      return;
    }

    const roomName = this.getRoomName(tenantId, branchId);

    const enrichedPayload = {
      event: eventName,
      tenantId, // server-resolved, never from client
      branchId,
      timestamp: new Date().toISOString(),
      data: payload,
    };

    this.logger.log(`Broadcasting ${eventName} to room ${roomName} | order: ${String(payload?.id ?? payload?.orderNumber ?? 'unknown')}`);

    if (this.server) {
      this.server.to(roomName).emit(eventName, enrichedPayload);
    } else {
      this.logger.warn(`Broadcast skipped: WebSocket server not initialized (likely in unit test)`);
    }
  }

  // Convenience wrappers for explicit event types
  public emitOrderCreated(tenantId: string, branchId: string, order: BroadcastPayload): void {
    this.broadcastOrderEvent(tenantId, branchId, 'order.created', order);
  }

  public emitOrderAccepted(tenantId: string, branchId: string, order: BroadcastPayload): void {
    this.broadcastOrderEvent(tenantId, branchId, 'order.accepted', order);
  }

  public emitOrderPreparing(tenantId: string, branchId: string, order: BroadcastPayload): void {
    this.broadcastOrderEvent(tenantId, branchId, 'order.preparing', order);
  }

  public emitOrderReady(tenantId: string, branchId: string, order: BroadcastPayload): void {
    this.broadcastOrderEvent(tenantId, branchId, 'order.ready', order);
  }

  public emitOrderCompleted(tenantId: string, branchId: string, order: BroadcastPayload): void {
    this.broadcastOrderEvent(tenantId, branchId, 'order.completed', order);
  }

  public emitOrderCancelled(tenantId: string, branchId: string, order: BroadcastPayload): void {
    this.broadcastOrderEvent(tenantId, branchId, 'order.cancelled', order);
  }

  /**
   * Canonical KDS event: ticket.created
   * Emits spec-compliant payload per DOC-004 3.8 / DOC-005 4.5.
   */
  public emitTicketCreated(
    tenantId: string,
    branchId: string,
    ticket: { ticketId: string; ticketNumber: string; priority: string; items: Record<string, unknown>[] },
  ): void {
    this.broadcastOrderEvent(tenantId, branchId, 'ticket.created', ticket);
  }

  /**
   * Server-side priority escalation event: ticket.priority_changed
   * Emitted when a ticket's priority transitions (e.g., NORMAL -> RUSH).
   */
  public emitTicketPriorityChanged(
    tenantId: string,
    branchId: string,
    ticketId: string,
    oldPriority: string,
    newPriority: string,
  ): void {
    this.broadcastOrderEvent(tenantId, branchId, 'ticket.priority_changed', {
      ticketId,
      oldPriority,
      newPriority,
    });
  }
}
