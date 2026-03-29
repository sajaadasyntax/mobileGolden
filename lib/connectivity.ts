import NetInfo, { NetInfoState } from '@react-native-community/netinfo';

type StatusCallback = (isOnline: boolean) => void;

class ConnectivityService {
  private _isOnline = true;
  private _subscribers: Set<StatusCallback> = new Set();
  private _unsubscribeNetInfo: (() => void) | null = null;

  constructor() {
    this._startListening();
  }

  private _startListening() {
    this._unsubscribeNetInfo = NetInfo.addEventListener((state: NetInfoState) => {
      const online = !!(state.isConnected && state.isInternetReachable !== false);
      if (online !== this._isOnline) {
        this._isOnline = online;
        this._subscribers.forEach((cb) => cb(online));
      }
    });

    // Fetch initial state
    NetInfo.fetch().then((state) => {
      this._isOnline = !!(state.isConnected && state.isInternetReachable !== false);
    });
  }

  isOnline(): boolean {
    return this._isOnline;
  }

  onStatusChange(cb: StatusCallback): () => void {
    this._subscribers.add(cb);
    return () => {
      this._subscribers.delete(cb);
    };
  }

  destroy() {
    this._unsubscribeNetInfo?.();
    this._subscribers.clear();
  }
}

export const connectivity = new ConnectivityService();
