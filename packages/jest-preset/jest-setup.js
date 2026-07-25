require('@testing-library/jest-dom');

Object.defineProperty(window, 'localStorage', {
  value: {
    getItem: jest.fn(() => null),
    setItem: jest.fn(() => {}),
    removeItem: jest.fn(() => {}),
    clear: jest.fn(() => {}),
  },
  writable: true,
});

global.fetch = jest.fn(() =>
  Promise.resolve({ ok: true, json: () => Promise.resolve([]) })
);

const mockAddEventListener = jest.fn();
const mockRemoveEventListener = jest.fn();
const mockRegister = jest.fn().mockResolvedValue({ scope: 'http://localhost/' });

Object.defineProperty(navigator, 'serviceWorker', {
  value: {
    register: mockRegister,
    addEventListener: mockAddEventListener,
    removeEventListener: mockRemoveEventListener,
  },
  writable: true,
});

jest.mock('idb', () => ({
  openDB: jest.fn().mockResolvedValue({
    getAll: jest.fn().mockResolvedValue([]),
    put: jest.fn().mockResolvedValue(undefined),
    delete: jest.fn().mockResolvedValue(undefined),
    get: jest.fn().mockResolvedValue(null),
  }),
}));

const mockSocketOn = jest.fn();
const mockSocketEmit = jest.fn();
const mockSocketDisconnect = jest.fn();
const mockSocket = {
  on: mockSocketOn,
  emit: mockSocketEmit,
  disconnect: mockSocketDisconnect,
};

jest.mock('socket.io-client', () => ({
  __esModule: true,
  default: jest.fn(() => mockSocket),
}));
