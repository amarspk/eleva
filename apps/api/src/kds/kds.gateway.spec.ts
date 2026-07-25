import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { KdsGateway } from './kds.gateway';
import { AuthService } from '../auth/auth.service';
import { CacheService } from '../common/cache/cache.service';
import { TenantBranchRepository, dbTenantContext } from '@zayjar/db';
import { Socket } from 'socket.io';

// Mock argon2
jest.mock('argon2', () => ({
  hash: jest.fn().mockResolvedValue('mock-hash'),
  verify: jest.fn().mockResolvedValue(true),
  argon2id: 2,
}));

// Mock Socket.io Server
const mockServerToEmit = jest.fn();
const mockServerTo = jest.fn().mockReturnValue({ emit: mockServerToEmit });

describe('KdsGateway Unit Tests - TSK-2.1 Real-Time KDS', () => {
  let gateway: KdsGateway;
  let jwtService: JwtService;
  let authService: AuthService;

  const mockCacheService = {
    get: jest.fn().mockImplementation((_key, fetchFn) => fetchFn()),
    set: jest.fn().mockResolvedValue(undefined),
    isCacheActive: () => false,
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KdsGateway,
        {
          provide: JwtService,
          useValue: {
            verifyAsync: jest.fn(),
            signAsync: jest.fn(),
          },
        },
        {
          provide: AuthService,
          useValue: {
            isTokenBlacklisted: jest.fn().mockResolvedValue(false),
            blacklistToken: jest.fn(),
          },
        },
        {
          provide: CacheService,
          useValue: mockCacheService,
        },
      ],
    }).compile();

    gateway = module.get<KdsGateway>(KdsGateway);
    jwtService = module.get<JwtService>(JwtService);
    authService = module.get<AuthService>(AuthService);

    // Inject mock server
    (gateway as any).server = {
      to: mockServerTo,
    };
  });

  // ==========================================
  // 1. Room Naming Convention
  // ==========================================
  describe('Room Scoping: tenant:{tenantId}:branch:{branchId}', () => {
    it('should generate canonical room name scoped by tenantId and branchId', () => {
      const tenantId = 'tenant-uuid-123';
      const branchId = 'branch-uuid-456';
      const room = gateway.getRoomName(tenantId, branchId);
      expect(room).toBe(`tenant:${tenantId}:branch:${branchId}`);
    });

    it('should ensure different tenants produce different rooms even with same branchId', () => {
      const branchId = 'same-branch';
      const roomA = gateway.getRoomName('tenant-A', branchId);
      const roomB = gateway.getRoomName('tenant-B', branchId);
      expect(roomA).not.toBe(roomB);
      expect(roomA).toBe('tenant:tenant-A:branch:same-branch');
      expect(roomB).toBe('tenant:tenant-B:branch:same-branch');
    });

    it('should ensure tenant isolation: room name never trusts client-provided tenantId', () => {
      // Simulate that room is always built from authenticated user tenantId
      const authenticatedTenantId = 'real-tenant-from-jwt';
      const maliciousTenantId = 'evil-tenant-from-client';
      const branchId = 'branch-1';

      // Gateway always uses authenticated tenantId, ignores malicious
      const legitimateRoom = gateway.getRoomName(authenticatedTenantId, branchId);
      const maliciousRoom = gateway.getRoomName(maliciousTenantId, branchId);

      expect(legitimateRoom).not.toBe(maliciousRoom);
      expect(legitimateRoom).toContain(authenticatedTenantId);
      expect(legitimateRoom).not.toContain(maliciousTenantId);
    });
  });

  // ==========================================
  // 2. Broadcast events
  // ==========================================
  describe('Broadcast order events to scoped rooms', () => {
    it('should broadcast order.created to correct tenant+branch room', () => {
      const tenantId = 'tenant-1';
      const branchId = 'branch-1';
      const order = { id: 'order-1', orderNumber: 'ORD-001', status: 'PENDING' };

      gateway.broadcastOrderEvent(tenantId, branchId, 'order.created', order);

      expect(mockServerTo).toHaveBeenCalledWith(`tenant:${tenantId}:branch:${branchId}`);
      expect(mockServerToEmit).toHaveBeenCalledWith(
        'order.created',
        expect.objectContaining({
          event: 'order.created',
          tenantId,
          branchId,
          data: order,
          timestamp: expect.any(String),
        }),
      );
    });

    it('should broadcast all required KDS events: order.created, accepted, preparing, ready, completed, cancelled', () => {
      const tenantId = 'tenant-1';
      const branchId = 'branch-1';
      const order = { id: 'order-xyz' };

      const events = [
        'order.created',
        'order.accepted',
        'order.preparing',
        'order.ready',
        'order.completed',
        'order.cancelled',
      ];

      events.forEach((eventName) => {
        gateway.broadcastOrderEvent(tenantId, branchId, eventName, order);
      });

      expect(mockServerTo).toHaveBeenCalledTimes(events.length);
      events.forEach((eventName, idx) => {
        const call = mockServerToEmit.mock.calls[idx];
        expect(call[0]).toBe(eventName);
      });
    });

    it('should use convenience emitters that delegate to broadcastOrderEvent', () => {
      const spy = jest.spyOn(gateway, 'broadcastOrderEvent');
      const tenantId = 't1';
      const branchId = 'b1';
      const order = { id: 'o1' };

      gateway.emitOrderCreated(tenantId, branchId, order);
      expect(spy).toHaveBeenCalledWith(tenantId, branchId, 'order.created', order);

      gateway.emitOrderAccepted(tenantId, branchId, order);
      expect(spy).toHaveBeenCalledWith(tenantId, branchId, 'order.accepted', order);

      gateway.emitOrderPreparing(tenantId, branchId, order);
      expect(spy).toHaveBeenCalledWith(tenantId, branchId, 'order.preparing', order);

      gateway.emitOrderReady(tenantId, branchId, order);
      expect(spy).toHaveBeenCalledWith(tenantId, branchId, 'order.ready', order);

      gateway.emitOrderCompleted(tenantId, branchId, order);
      expect(spy).toHaveBeenCalledWith(tenantId, branchId, 'order.completed', order);

      gateway.emitOrderCancelled(tenantId, branchId, order);
      expect(spy).toHaveBeenCalledWith(tenantId, branchId, 'order.cancelled', order);
    });

    it('should skip broadcast when tenantId or branchId missing (fail-safe)', () => {
      gateway.broadcastOrderEvent('', 'branch-1', 'order.created', { id: '1' });
      gateway.broadcastOrderEvent('tenant-1', '', 'order.created', { id: '1' });
      expect(mockServerTo).not.toHaveBeenCalled();
    });
  });

  // ==========================================
  // 3. JWT Authentication on handleConnection
  // ==========================================
  describe('JWT Authentication for WebSocket connections', () => {
    const createMockSocket = (handshake: any): Partial<Socket> => {
      return {
        id: 'socket-123',
        handshake: {
          auth: handshake.auth || {},
          headers: handshake.headers || {},
          query: handshake.query || {},
        } as any,
        data: {} as any,
        emit: jest.fn(),
        disconnect: jest.fn(),
      };
    };

    it('should reject connection when token is missing', async () => {
      const mockSocket = createMockSocket({ auth: {}, headers: {}, query: {} }) as Socket;

      await gateway.handleConnection(mockSocket);

      expect(mockSocket.emit).toHaveBeenCalledWith('error', expect.objectContaining({ message: expect.stringContaining('Missing JWT') }));
      expect(mockSocket.disconnect).toHaveBeenCalledWith(true);
    });

    it('should reject connection when token is invalid', async () => {
      jest.spyOn(jwtService, 'verifyAsync').mockRejectedValue(new Error('jwt malformed'));

      const mockSocket = createMockSocket({
        auth: { token: 'invalid-token' },
        headers: {},
        query: {},
      }) as Socket;

      await gateway.handleConnection(mockSocket);

      expect(mockSocket.emit).toHaveBeenCalledWith('error', expect.objectContaining({ message: expect.stringContaining('Invalid') }));
      expect(mockSocket.disconnect).toHaveBeenCalledWith(true);
    });

    it('should reject connection when token is blacklisted', async () => {
      jest.spyOn(jwtService, 'verifyAsync').mockResolvedValue({
        sub: 'user-1',
        email: 'test@zayjar.com',
        tenantId: 'tenant-1',
        roles: [],
        permissions: [],
      } as any);
      jest.spyOn(authService, 'isTokenBlacklisted').mockResolvedValue(true);

      const mockSocket = createMockSocket({
        auth: { token: 'blacklisted-token' },
        headers: {},
        query: {},
      }) as Socket;

      await gateway.handleConnection(mockSocket);

      expect(mockSocket.emit).toHaveBeenCalledWith('error', expect.objectContaining({ message: expect.stringContaining('revoked') }));
      expect(mockSocket.disconnect).toHaveBeenCalled();
    });

    it('should reject connection when tenantId missing in JWT payload', async () => {
      jest.spyOn(jwtService, 'verifyAsync').mockResolvedValue({
        sub: 'user-1',
        email: 'test@zayjar.com',
        tenantId: null,
        roles: [],
        permissions: [],
      } as any);
      jest.spyOn(authService, 'isTokenBlacklisted').mockResolvedValue(false);

      const mockSocket = createMockSocket({
        auth: { token: 'valid-token-no-tenant' },
        headers: {},
        query: {},
      }) as Socket;

      await gateway.handleConnection(mockSocket);

      expect(mockSocket.emit).toHaveBeenCalledWith('error', expect.objectContaining({ message: expect.stringContaining('Tenant context missing') }));
      expect(mockSocket.disconnect).toHaveBeenCalled();
    });

    it('should accept valid token from handshake.auth.token and attach user to socket.data', async () => {
      const payload = {
        sub: 'user-42',
        email: 'chef@zayjar.com',
        tenantId: 'tenant-42',
        roles: ['BRANCH_STAFF'],
        permissions: ['read:Order'],
      };
      jest.spyOn(jwtService, 'verifyAsync').mockResolvedValue(payload as any);
      jest.spyOn(authService, 'isTokenBlacklisted').mockResolvedValue(false);

      const mockSocket = createMockSocket({
        auth: { token: 'valid-jwt-token' },
        headers: {},
        query: {},
      }) as Socket;

      await gateway.handleConnection(mockSocket);

      expect(jwtService.verifyAsync).toHaveBeenCalledWith('valid-jwt-token', expect.any(Object));
      expect((mockSocket.data as any).user).toEqual(
        expect.objectContaining({
          id: 'user-42',
          tenantId: 'tenant-42',
          email: 'chef@zayjar.com',
        }),
      );
      expect(mockSocket.emit).toHaveBeenCalledWith('connected', expect.objectContaining({ tenantId: 'tenant-42' }));
      expect(mockSocket.disconnect).not.toHaveBeenCalled();
    });

    it('should extract token from Authorization header Bearer', async () => {
      const payload = {
        sub: 'user-2',
        email: 'kds@zayjar.com',
        tenantId: 'tenant-2',
        roles: [],
        permissions: [],
      };
      jest.spyOn(jwtService, 'verifyAsync').mockResolvedValue(payload as any);
      jest.spyOn(authService, 'isTokenBlacklisted').mockResolvedValue(false);

      const mockSocket = createMockSocket({
        auth: {},
        headers: { authorization: 'Bearer valid-token-from-header' },
        query: {},
      }) as Socket;

      await gateway.handleConnection(mockSocket);

      expect(jwtService.verifyAsync).toHaveBeenCalledWith('valid-token-from-header', expect.any(Object));
      expect((mockSocket.data as any).user.tenantId).toBe('tenant-2');
    });

    it('should extract token from query param', async () => {
      const payload = {
        sub: 'user-3',
        email: 'kds@zayjar.com',
        tenantId: 'tenant-3',
        roles: [],
        permissions: [],
      };
      jest.spyOn(jwtService, 'verifyAsync').mockResolvedValue(payload as any);
      jest.spyOn(authService, 'isTokenBlacklisted').mockResolvedValue(false);

      const mockSocket = createMockSocket({
        auth: {},
        headers: {},
        query: { token: 'token-from-query' },
      }) as Socket;

      await gateway.handleConnection(mockSocket);

      expect(jwtService.verifyAsync).toHaveBeenCalledWith('token-from-query', expect.any(Object));
    });
  });

  // ==========================================
  // 4. Room joining with tenant isolation
  // ==========================================
  describe('joinBranch with tenant isolation', () => {
    const createAuthenticatedSocket = (tenantId: string): Partial<Socket> => {
      return {
        id: 'socket-auth',
        data: {
          user: { id: 'user-1', email: 'test@zayjar.com', tenantId, roles: [], permissions: [] },
        } as any,
        handshake: {} as any,
        emit: jest.fn(),
        disconnect: jest.fn(),
        join: jest.fn().mockResolvedValue(undefined),
        leave: jest.fn().mockResolvedValue(undefined),
      };
    };

    it('should reject joinBranch if socket not authenticated', async () => {
      const unauthSocket = {
        id: 'unauth',
        data: {},
        emit: jest.fn(),
        disconnect: jest.fn(),
        join: jest.fn(),
      } as unknown as Socket;

      const _result = await gateway.handleJoinBranch(unauthSocket, { branchId: 'branch-1' });

      expect(unauthSocket.emit).toHaveBeenCalledWith('error', expect.objectContaining({ message: expect.stringContaining('Not authenticated') }));
    });

    it('should reject joinBranch if branchId missing', async () => {
      const socket = createAuthenticatedSocket('tenant-1') as Socket;
      await gateway.handleJoinBranch(socket, {} as any);
      expect(socket.emit).toHaveBeenCalledWith('error', expect.objectContaining({ message: expect.stringContaining('branchId') }));
    });

    it('should reject joinBranch if branch does not belong to tenant', async () => {
      const socket = createAuthenticatedSocket('tenant-1') as Socket;

      // Mock repository to return null (branch not found under tenant context)
      jest.spyOn(TenantBranchRepository.prototype, 'findById').mockResolvedValue(null);

      // Mock dbTenantContext.run to execute callback and preserve isolation logic
      jest.spyOn(dbTenantContext, 'run').mockImplementation((ctx, cb: any) => cb());

      await gateway.handleJoinBranch(socket, { branchId: 'branch-not-owned' });

      expect(socket.emit).toHaveBeenCalledWith('error', expect.objectContaining({ message: expect.stringContaining('not found or inaccessible') }));
      expect(socket.join).not.toHaveBeenCalled();
    });

    it('should allow joinBranch if branch belongs to authenticated tenant', async () => {
      const socket = createAuthenticatedSocket('tenant-1') as Socket;

      jest.spyOn(TenantBranchRepository.prototype, 'findById').mockResolvedValue({
        id: 'branch-1',
        tenantId: 'tenant-1',
        restaurantId: 'rest-1',
      } as any);

      jest.spyOn(dbTenantContext, 'run').mockImplementation((ctx: any, cb: any) => {
        // Ensure tenantId from context matches authenticated user, not client payload
        expect(ctx.tenantId).toBe('tenant-1');
        return cb();
      });

      const _result = await gateway.handleJoinBranch(socket, { branchId: 'branch-1' });

      expect(socket.join).toHaveBeenCalledWith('tenant:tenant-1:branch:branch-1');
      expect(socket.emit).toHaveBeenCalledWith('joinedBranch', expect.objectContaining({ room: 'tenant:tenant-1:branch:branch-1' }));
    });

    it('should never trust tenantId from client payload, always use authenticated tenantId', async () => {
      const socket = createAuthenticatedSocket('real-tenant-from-jwt') as Socket;

      jest.spyOn(TenantBranchRepository.prototype, 'findById').mockResolvedValue({
        id: 'branch-1',
        tenantId: 'real-tenant-from-jwt',
      } as any);

      let capturedContext: any = null;
      jest.spyOn(dbTenantContext, 'run').mockImplementation((ctx: any, cb: any) => {
        capturedContext = ctx;
        return cb();
      });

      // Malicious client tries to inject tenantId in payload
      const maliciousPayload = { branchId: 'branch-1', tenantId: 'evil-tenant' } as any;

      await gateway.handleJoinBranch(socket, maliciousPayload);

      // Should use real tenant, not evil
      expect(capturedContext.tenantId).toBe('real-tenant-from-jwt');
      expect(capturedContext.tenantId).not.toBe('evil-tenant');
      expect(socket.join).toHaveBeenCalledWith('tenant:real-tenant-from-jwt:branch:branch-1');
    });
  });
});
