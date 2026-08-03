import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { KdsGateway } from './kds.gateway';
import { AuthService } from '../auth/auth.service';
import { CacheService } from '../common/cache/cache.service';
import { Server } from 'socket.io';

jest.mock('argon2', () => ({
  hash: jest.fn().mockResolvedValue('mock-hash'),
  verify: jest.fn().mockResolvedValue(true),
  argon2id: 2,
}));

// Mock the redis client module so no real connection is attempted in tests.
const mockConnect = jest.fn().mockResolvedValue('OK');
const mockQuit = jest.fn().mockResolvedValue('OK');
const mockOn = jest.fn();
const mockDuplicate = jest.fn();

jest.mock('redis', () => ({
  createClient: jest.fn(() => ({
    connect: mockConnect,
    quit: mockQuit,
    on: mockOn,
    duplicate: mockDuplicate,
  })),
}));

// Mock the Socket.io Redis adapter factory.
const mockCreateAdapter = jest.fn().mockReturnValue({ __mockAdapter: true });
jest.mock('@socket.io/redis-adapter', () => ({
  createAdapter: (...args: unknown[]) => mockCreateAdapter(...args),
}));

describe('KdsGateway Redis Adapter (Sprint 2 Task 6 — SPEC_INDEX §7.6)', () => {
  let gateway: KdsGateway;
  let server: Server;

  const mockCacheService = {
    get: jest.fn().mockImplementation((_key: string, fetchFn: () => unknown) => fetchFn()),
    set: jest.fn().mockResolvedValue(undefined),
    isCacheActive: () => false,
  };

  const mockAuthService = {
    isTokenBlacklisted: jest.fn().mockResolvedValue(false),
  };

  const mockJwtService = {
    verifyAsync: jest.fn().mockResolvedValue({
      sub: 'user-1',
      email: 'a@b.com',
      tenantId: 'tenant-1',
      roles: [],
      permissions: [],
    }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KdsGateway,
        { provide: JwtService, useValue: mockJwtService },
        { provide: AuthService, useValue: mockAuthService },
        { provide: CacheService, useValue: mockCacheService },
      ],
    }).compile();

    gateway = module.get<KdsGateway>(KdsGateway);
    // Minimal fake Socket.io server with the real adapter() signature.
    server = {
      adapter: jest.fn(),
    } as unknown as Server;
    (gateway as unknown as { server: Server }).server = server;
  });

  afterEach(() => {
    delete process.env.REDIS_URL;
    delete process.env.SOCKET_IO_REDIS_URL;
    delete process.env.REDIS_TLS;
  });

  it('keeps the in-memory adapter when no Redis URL is configured', async () => {
    await gateway.afterInit(server);
    expect(server.adapter).not.toHaveBeenCalled();
    expect(mockCreateAdapter).not.toHaveBeenCalled();
  });

  it('attaches the Redis adapter when REDIS_URL is configured', async () => {
    process.env.REDIS_URL = 'redis://localhost:6379';
    mockConnect.mockResolvedValueOnce('OK');
    mockDuplicate.mockReturnValueOnce({
      connect: jest.fn().mockResolvedValue('OK'),
      on: mockOn,
      quit: mockQuit,
    });

    await gateway.afterInit(server);

    expect(server.adapter).toHaveBeenCalledTimes(1);
    expect(server.adapter).toHaveBeenCalledWith({ __mockAdapter: true });
    expect(mockCreateAdapter).toHaveBeenCalledTimes(1);
  });

  it('falls back to the in-memory adapter when Redis is unreachable', async () => {
    process.env.SOCKET_IO_REDIS_URL = 'redis://unreachable:6379';
    // Both pub and sub share the same connect mock so the rejection is
    // consumed by Promise.all (the duplicate must resolve to a client shape
    // for the flow to reach connect at all).
    mockConnect.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    mockDuplicate.mockReturnValue({
      connect: mockConnect,
      on: mockOn,
      quit: mockQuit,
    });

    await gateway.afterInit(server);

    expect(server.adapter).not.toHaveBeenCalled();
    expect(mockCreateAdapter).not.toHaveBeenCalled();
  });

  it('shuts down the pub/sub clients on module destroy', async () => {
    process.env.REDIS_URL = 'redis://localhost:6379';
    mockConnect.mockResolvedValue('OK');
    mockDuplicate.mockReturnValue({
      connect: jest.fn().mockResolvedValue('OK'),
      on: mockOn,
      quit: mockQuit,
    });

    await gateway.afterInit(server);
    await gateway.onModuleDestroy();

    expect(mockQuit).toHaveBeenCalled();
  });
});
