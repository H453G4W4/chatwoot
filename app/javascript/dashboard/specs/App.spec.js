import { describe, it, beforeEach, expect, vi } from 'vitest';

const connectors = [];
const reconnectServices = [];

vi.mock('dashboard/store/modules/conversations/realtimeState', () => ({
  resetRealtimeState: vi.fn(),
}));

vi.mock('../helper/actionCable', () => ({
  default: {
    init: vi.fn(() => {
      const connector = { disconnect: vi.fn(), id: connectors.length };
      connectors.push(connector);
      return connector;
    }),
  },
}));

vi.mock('dashboard/helper/ReconnectService', () => ({
  default: vi.fn(() => {
    const service = { disconnect: vi.fn(), id: reconnectServices.length };
    reconnectServices.push(service);
    return service;
  }),
}));

vi.mock('../helper/pushHelper', () => ({
  registerSubscription: vi.fn(),
  verifyServiceWorkerExistence: vi.fn(),
}));

vi.mock('../helper/themeHelper', () => ({ setColorTheme: vi.fn() }));

import App from '../App.vue';
import vueActionCable from '../helper/actionCable';
import { resetRealtimeState } from 'dashboard/store/modules/conversations/realtimeState';

// initializeAccount and the teardown helper are exercised directly on the options object.
// Mounting App would drag in the router, i18n and every banner component without adding
// anything to what this phase changes.
const buildVm = (overrides = {}) => ({
  $store: { dispatch: vi.fn().mockResolvedValue({}) },
  store: { dispatch: vi.fn() },
  router: {},
  currentAccountId: 1,
  currentUser: { pubsub_token: 'pubsub-token' },
  uiSettings: {},
  getAccount: () => ({ locale: 'en', latest_chatwoot_version: '4.17.1' }),
  setLocale: vi.fn(),
  latestChatwootVersion: null,
  actionCableConnector: null,
  reconnectService: null,
  teardownRealtimeServices: App.methods.teardownRealtimeServices,
  ...overrides,
});

const initialize = vm => App.methods.initializeAccount.call(vm);

describe('App realtime lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    connectors.length = 0;
    reconnectServices.length = 0;
    window.reconnectService = null;
  });

  describe('account switch', () => {
    it('disconnects the previous ActionCable connector', async () => {
      const vm = buildVm();
      await initialize(vm);
      const first = vm.actionCableConnector;
      expect(first.disconnect).not.toHaveBeenCalled();

      vm.currentAccountId = 2;
      await initialize(vm);

      expect(first.disconnect).toHaveBeenCalledTimes(1);
      expect(vm.actionCableConnector).not.toBe(first);
    });

    it('disconnects the previous ReconnectService', async () => {
      const vm = buildVm();
      await initialize(vm);
      const first = vm.reconnectService;

      vm.currentAccountId = 2;
      await initialize(vm);

      expect(first.disconnect).toHaveBeenCalledTimes(1);
      expect(vm.reconnectService).not.toBe(first);
    });

    it('resets realtime state before the new connector is initialized', async () => {
      const vm = buildVm();
      await initialize(vm);

      const order = [];
      resetRealtimeState.mockImplementation(() => order.push('reset'));
      vueActionCable.init.mockImplementation(() => {
        order.push('init');
        return { disconnect: vi.fn() };
      });

      vm.currentAccountId = 2;
      await initialize(vm);

      expect(order).toEqual(['reset', 'init']);
    });

    it('leaves exactly one connector alive, so one event causes one dispatch', async () => {
      const vm = buildVm();
      await initialize(vm);
      vm.currentAccountId = 2;
      await initialize(vm);
      vm.currentAccountId = 3;
      await initialize(vm);

      expect(connectors).toHaveLength(3);
      // every superseded connector was disconnected exactly once
      expect(connectors[0].disconnect).toHaveBeenCalledTimes(1);
      expect(connectors[1].disconnect).toHaveBeenCalledTimes(1);
      expect(connectors[2].disconnect).not.toHaveBeenCalled();
      expect(vm.actionCableConnector).toBe(connectors[2]);
    });

    it('tears down before awaiting the account fetch, so both are never alive at once', async () => {
      const vm = buildVm();
      await initialize(vm);
      const first = vm.actionCableConnector;

      let disconnectedBeforeFetch = false;
      vm.$store.dispatch = vi.fn(() => {
        disconnectedBeforeFetch = first.disconnect.mock.calls.length === 1;
        return Promise.resolve({});
      });

      vm.currentAccountId = 2;
      await initialize(vm);

      expect(disconnectedBeforeFetch).toBe(true);
    });
  });

  describe('teardown', () => {
    it('disconnects both services and resets realtime state on unmount', async () => {
      const vm = buildVm();
      await initialize(vm);
      const connector = vm.actionCableConnector;
      const service = vm.reconnectService;
      vi.clearAllMocks();

      App.unmounted.call(vm);

      expect(connector.disconnect).toHaveBeenCalledTimes(1);
      expect(service.disconnect).toHaveBeenCalledTimes(1);
      expect(resetRealtimeState).toHaveBeenCalledTimes(1);
      expect(vm.actionCableConnector).toBeNull();
      expect(vm.reconnectService).toBeNull();
      expect(window.reconnectService).toBeNull();
    });

    it('is safe when nothing was ever initialized', () => {
      const vm = buildVm();
      expect(() => App.unmounted.call(vm)).not.toThrow();
      expect(resetRealtimeState).toHaveBeenCalledTimes(1);
    });
  });
});
