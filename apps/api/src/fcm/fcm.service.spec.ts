import { FcmService } from './fcm.service';

const mockInitializeApp = jest.fn();
const mockCert = jest.fn((cred: unknown) => cred);
jest.mock('firebase-admin/app', () => ({
  initializeApp: (config: unknown) => mockInitializeApp(config),
  cert: (credential: unknown) => mockCert(credential),
}));

const mockSendEachForMulticast = jest.fn();
jest.mock('firebase-admin/messaging', () => ({
  getMessaging: jest.fn(() => ({ sendEachForMulticast: mockSendEachForMulticast })),
}));

const SERVICE_ACCOUNT = JSON.stringify({
  type: 'service_account',
  project_id: 'zayjar-test',
  private_key: '-----BEGIN PRIVATE KEY-----\nMOCK\n-----END PRIVATE KEY-----\n',
  client_email: 'firebase-adminsdk@zayjar-test.iam.gserviceaccount.com',
});

describe('FcmService (Sprint 2 Task 7 — real Firebase Cloud Messaging)', () => {
  let service: FcmService;

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.FIREBASE_SERVICE_ACCOUNT;
    delete process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
    service = new FcmService();
  });

  it('is unavailable and sends nothing when no credential is configured', async () => {
    expect(service.isAvailable()).toBe(false);
    const result = await service.sendPush(['tok-1'], 't', 'b');
    expect(result).toEqual({ successCount: 0, failureCount: 1, unregisteredTokens: [] });
    expect(mockInitializeApp).not.toHaveBeenCalled();
  });

  it('initializes from FIREBASE_SERVICE_ACCOUNT JSON and sends a real multicast', async () => {
    process.env.FIREBASE_SERVICE_ACCOUNT = SERVICE_ACCOUNT;
    mockSendEachForMulticast.mockResolvedValueOnce({
      successCount: 2,
      failureCount: 0,
      responses: [{ success: true }, { success: true }],
    });

    expect(service.isAvailable()).toBe(true);
    const result = await service.sendPush(['tok-1', 'tok-2'], 'New order', 'Order placed', {
      orderId: 'o-1',
      amount: 12.5,
    });

    expect(mockInitializeApp).toHaveBeenCalledTimes(1);
    expect(mockCert).toHaveBeenCalledWith(JSON.parse(SERVICE_ACCOUNT));
    expect(result).toEqual({ successCount: 2, failureCount: 0, unregisteredTokens: [] });
    expect(mockSendEachForMulticast).toHaveBeenCalledWith({
      tokens: ['tok-1', 'tok-2'],
      notification: { title: 'New order', body: 'Order placed' },
      data: { orderId: 'o-1', amount: '12.5' },
    });
  });

  it('flags tokens that are no longer registered for pruning', async () => {
    process.env.FIREBASE_SERVICE_ACCOUNT = SERVICE_ACCOUNT;
    mockSendEachForMulticast.mockResolvedValueOnce({
      successCount: 1,
      failureCount: 1,
      responses: [
        { success: true },
        { success: false, error: { code: 'messaging/registration-token-not-registered' } },
      ],
    });

    const result = await service.sendPush(['tok-ok', 'tok-stale'], 't', 'b');

    expect(result).toEqual({
      successCount: 1,
      failureCount: 1,
      unregisteredTokens: ['tok-stale'],
    });
  });

  it('reports a full failure (never throws) when FCM send errors', async () => {
    process.env.FIREBASE_SERVICE_ACCOUNT = SERVICE_ACCOUNT;
    mockSendEachForMulticast.mockRejectedValueOnce(new Error('FCM outage'));

    const result = await service.sendPush(['tok-1'], 't', 'b');

    expect(result).toEqual({ successCount: 0, failureCount: 1, unregisteredTokens: [] });
  });
});
