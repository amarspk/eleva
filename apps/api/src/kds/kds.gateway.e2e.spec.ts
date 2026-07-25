import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { KdsGateway } from './kds.gateway';
import { AuthService } from '../auth/auth.service';
import { CacheService } from '../common/cache/cache.service';
import { TenantBranchRepository, dbTenantContext } from '@zayjar/db';
import { io as ClientIO, Socket as ClientSocket } from 'socket.io-client';
import { Server } from 'socket.io';
import { createServer } from 'http';
import { Socket as ServerSocket } from 'socket.io';

jest.mock('argon2', () => ({
  hash: jest.fn().mockResolvedValue('mock-hash'),
  verify: jest.fn().mockResolvedValue(true),
  argon2id: 2,
}));

describe('KdsGateway E2E WebSocket Tests - TSK-2.1', () => {
  let gateway: KdsGateway;
  let jwtService: JwtService;
  let authService: AuthService;
  let httpServer: any;
  let ioServer: Server;
  let kdsNamespace: any;
  let clientSocket: ClientSocket;

  const mockCacheService = {
    get: jest.fn().mockImplementation((_key, fetchFn) => fetchFn()),
    set: jest.fn().mockResolvedValue(undefined),
    del: jest.fn().mockResolvedValue(undefined),
    flush: jest.fn().mockResolvedValue(undefined),
    isCacheActive: () => false,
  };

  const validUserPayload = {
    sub: 'user-e2e-1',
    email: 'chef-e2e@zayjar.com',
    tenantId: 'tenant-e2e-1',
    roles: ['KITCHEN_STAFF'],
    permissions: ['read:Order', 'update:Order'],
  };

  const validToken = 'valid-e2e-jwt-token';

  beforeAll(async () => {
    httpServer = createServer();
    ioServer = new Server(httpServer, {
      cors: { origin: '*' },
    });

    kdsNamespace = ioServer.of('/kds');

    const moduleFixture: TestingModule = await Test.createTestingModule({
      providers: [
        KdsGateway,
        {
          provide: JwtService,
          useValue: {
            verifyAsync: jest.fn().mockImplementation(async (token: string) => {
              if (token === validToken) {return validUserPayload;}
              throw new Error('Invalid token');
            }),
            signAsync: jest.fn().mockResolvedValue(validToken),
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

    gateway = moduleFixture.get<KdsGateway>(KdsGateway);
    jwtService = moduleFixture.get<JwtService>(JwtService);
    authService = moduleFixture.get<AuthService>(AuthService);

    (gateway as any).server = kdsNamespace;

    kdsNamespace.on('connection', async (socket: ServerSocket) => {
      await gateway.handleConnection(socket as any);
      if ((socket as any).disconnected) {return;}

      socket.on('joinBranch', async (payload: any, ack: any) => {
        const result = await gateway.handleJoinBranch(socket as any, payload);
        if (typeof ack === 'function') {ack(result);}
      });

      socket.on('leaveBranch', async (payload: any, ack: any) => {
        const result = await gateway.handleLeaveBranch(socket as any, payload);
        if (typeof ack === 'function') {ack(result);}
      });

      socket.on('disconnect', () => {
        gateway.handleDisconnect(socket as any);
      });
    });

    await new Promise<void>((resolve) => {
      httpServer.listen(0, () => resolve());
    });
  });

  afterAll(async () => {
    if (clientSocket) {clientSocket.disconnect();}
    ioServer.close();
    httpServer.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(jwtService, 'verifyAsync').mockImplementation(async (token: string) => {
      if (token === validToken) {return validUserPayload as any;}
      throw new Error('Invalid token');
    });
    jest.spyOn(authService, 'isTokenBlacklisted').mockResolvedValue(false);
  });

  afterEach(() => {
    if (clientSocket && clientSocket.connected) {clientSocket.disconnect();}
    jest.restoreAllMocks();
  });

  const getPort = () => (httpServer.address() as any).port;

  it('E2E: should allow client with valid JWT to connect to /kds namespace', (done) => {
    const port = getPort();
    clientSocket = ClientIO(`http://localhost:${port}/kds`, {
      auth: { token: validToken },
      transports: ['websocket'],
    });

    clientSocket.on('connected', (data: any) => {
      try {
        expect(data.tenantId).toBe(validUserPayload.tenantId);
        expect(data.userId).toBe(validUserPayload.sub);
        done();
      } catch (e) {
        done(e as any);
      }
    });

    clientSocket.on('connect_error', (err) => {
      done(new Error(`Should not fail connection: ${err.message}`));
    });
  });

  it('E2E: should reject client without JWT token', (done) => {
    const port = getPort();
    const unauthClient = ClientIO(`http://localhost:${port}/kds`, {
      auth: {},
      transports: ['websocket'],
      reconnection: false,
    });

    let finished = false;
    const finish = (err?: any) => {
      if (!finished) {
        finished = true;
        unauthClient.close();
        if (err) {done(err);}
        else {done();}
      }
    };

    unauthClient.on('connected', () => {
      finish(new Error('Unauthenticated client should not receive connected'));
    });

    unauthClient.on('error', (payload: any) => {
      try {
        expect(payload.message).toBeDefined();
      } catch (e) {
        finish(e);
      }
    });

    unauthClient.on('disconnect', () => {
      finish();
    });

    unauthClient.on('connect_error', () => {
      setTimeout(() => finish(), 300);
    });
  });

  it('E2E: should join tenant-scoped room tenant:{tenantId}:branch:{branchId}', (done) => {
    const port = getPort();
    const tenantId = validUserPayload.tenantId;
    const branchId = 'branch-e2e-123';

    jest.spyOn(TenantBranchRepository.prototype, 'findById').mockResolvedValue({
      id: branchId,
      tenantId,
      restaurantId: 'rest-e2e',
    } as any);

    jest.spyOn(dbTenantContext, 'run').mockImplementation((ctx: any, cb: any) => {
      expect(ctx.tenantId).toBe(tenantId);
      return cb();
    });

    clientSocket = ClientIO(`http://localhost:${port}/kds`, {
      auth: { token: validToken },
      transports: ['websocket'],
    });

    clientSocket.on('connected', () => {
      clientSocket.emit('joinBranch', { branchId });
    });

    clientSocket.on('joinedBranch', (data: any) => {
      try {
        expect(data.room).toBe(`tenant:${tenantId}:branch:${branchId}`);
        expect(data.tenantId).toBe(tenantId);
        expect(data.branchId).toBe(branchId);
        done();
      } catch (e) {
        done(e as any);
      }
    });

    clientSocket.on('connect_error', (err) => {
      done(new Error(`Connection failed: ${err.message}`));
    });
  });

  it('E2E: should never trust tenantId from client payload, always use JWT tenantId', (done) => {
    const port = getPort();
    const realTenantId = validUserPayload.tenantId;
    const evilTenantId = 'evil-tenant-999';
    const branchId = 'branch-e2e-456';

    jest.spyOn(TenantBranchRepository.prototype, 'findById').mockResolvedValue({
      id: branchId,
      tenantId: realTenantId,
    } as any);

    let capturedTenantContext: string | null = null;
    jest.spyOn(dbTenantContext, 'run').mockImplementation((ctx: any, cb: any) => {
      capturedTenantContext = ctx.tenantId;
      return cb();
    });

    clientSocket = ClientIO(`http://localhost:${port}/kds`, {
      auth: { token: validToken },
      transports: ['websocket'],
    });

    clientSocket.on('connected', () => {
      clientSocket.emit('joinBranch', { branchId, tenantId: evilTenantId });
    });

    clientSocket.on('joinedBranch', (data: any) => {
      try {
        expect(capturedTenantContext).toBe(realTenantId);
        expect(capturedTenantContext).not.toBe(evilTenantId);
        expect(data.room).toBe(`tenant:${realTenantId}:branch:${branchId}`);
        expect(data.room).not.toContain(evilTenantId);
        expect(data.tenantId).toBe(realTenantId);
        done();
      } catch (e) {
        done(e as any);
      }
    });
  });

  it('E2E: should receive broadcasted order events after joining branch room', (done) => {
    const port = getPort();
    const tenantId = validUserPayload.tenantId;
    const branchId = 'branch-e2e-broadcast';
    const order = { id: 'order-broadcast-1', orderNumber: 'ORD-2026-E2E-001', status: 'PENDING' };

    jest.spyOn(TenantBranchRepository.prototype, 'findById').mockResolvedValue({
      id: branchId,
      tenantId,
    } as any);

    jest.spyOn(dbTenantContext, 'run').mockImplementation((ctx: any, cb: any) => cb());

    clientSocket = ClientIO(`http://localhost:${port}/kds`, {
      auth: { token: validToken },
      transports: ['websocket'],
    });

    clientSocket.on('connected', () => {
      clientSocket.emit('joinBranch', { branchId });
    });

    clientSocket.on('joinedBranch', () => {
      gateway.broadcastOrderEvent(tenantId, branchId, 'order.created', order);
    });

    clientSocket.on('order.created', (payload: any) => {
      try {
        expect(payload.event).toBe('order.created');
        expect(payload.tenantId).toBe(tenantId);
        expect(payload.branchId).toBe(branchId);
        expect(payload.data.id).toBe(order.id);
        expect(payload.timestamp).toBeDefined();
        done();
      } catch (e) {
        done(e as any);
      }
    });
  });

  it('E2E: should enforce tenant isolation - events only delivered to correct tenant room', (done) => {
    const port = getPort();
    const tenantA = validUserPayload.tenantId;
    const tenantB = 'tenant-e2e-2-different';
    const branchId = 'shared-branch-id';

    jest.spyOn(TenantBranchRepository.prototype, 'findById').mockResolvedValue({
      id: branchId,
      tenantId: tenantA,
    } as any);

    jest.spyOn(dbTenantContext, 'run').mockImplementation((ctx: any, cb: any) => cb());

    clientSocket = ClientIO(`http://localhost:${port}/kds`, {
      auth: { token: validToken },
      transports: ['websocket'],
    });

    let receivedOtherTenant = false;
    let timeoutId: NodeJS.Timeout;

    clientSocket.on('connected', () => {
      clientSocket.emit('joinBranch', { branchId });
    });

    clientSocket.on('joinedBranch', () => {
      gateway.broadcastOrderEvent(tenantB, branchId, 'order.created', { id: 'order-other-tenant' });
      timeoutId = setTimeout(() => {
        gateway.broadcastOrderEvent(tenantA, branchId, 'order.accepted', { id: 'order-my-tenant' });
      }, 100);
    });

    clientSocket.on('order.created', (payload: any) => {
      if (payload.tenantId === tenantB) {
        receivedOtherTenant = true;
        clearTimeout(timeoutId);
        done(new Error('Client received event for other tenant - isolation broken'));
      }
    });

    clientSocket.on('order.accepted', (payload: any) => {
      if (payload.tenantId === tenantA && payload.data.id === 'order-my-tenant') {
        try {
          expect(receivedOtherTenant).toBe(false);
          clearTimeout(timeoutId);
          done();
        } catch (e) {
          clearTimeout(timeoutId);
          done(e as any);
        }
      }
    });
  });

  it('E2E: should be able to receive all 6 required order events', (done) => {
    const port = getPort();
    const tenantId = validUserPayload.tenantId;
    const branchId = 'branch-e2e-all-events';

    jest.spyOn(TenantBranchRepository.prototype, 'findById').mockResolvedValue({
      id: branchId,
      tenantId,
    } as any);

    jest.spyOn(dbTenantContext, 'run').mockImplementation((ctx: any, cb: any) => cb());

    const requiredEvents = [
      'order.created',
      'order.accepted',
      'order.preparing',
      'order.ready',
      'order.completed',
      'order.cancelled',
    ];

    const receivedEvents: string[] = [];

    clientSocket = ClientIO(`http://localhost:${port}/kds`, {
      auth: { token: validToken },
      transports: ['websocket'],
    });

    requiredEvents.forEach((ev) => {
      clientSocket.on(ev, (payload: any) => {
        receivedEvents.push(payload.event);
        if (receivedEvents.length === requiredEvents.length) {
          try {
            expect(receivedEvents.sort()).toEqual(requiredEvents.sort());
            done();
          } catch (e) {
            done(e as any);
          }
        }
      });
    });

    clientSocket.on('connected', () => {
      clientSocket.emit('joinBranch', { branchId });
    });

    clientSocket.on('joinedBranch', () => {
      requiredEvents.forEach((ev, idx) => {
        setTimeout(() => {
          gateway.broadcastOrderEvent(tenantId, branchId, ev, { id: `order-${ev}`, status: ev });
        }, idx * 50);
      });
    });
  });
});
