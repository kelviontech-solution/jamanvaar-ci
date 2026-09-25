import { NetworkState } from '@jamanvaar/types';

export class NetworkStatusService {
  private static currentState: NetworkState = typeof navigator !== 'undefined' && !navigator.onLine ? 'OFFLINE' : 'ONLINE';
  private static latencyMs: number = 18;
  private static listeners: Array<(state: NetworkState, latency: number) => void> = [];

  static {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        // The browser only knows it is joined to a network, not that the internet is reachable.
        if (!this.verifiedUnreachable) this.setNetworkState('ONLINE');
      });
      window.addEventListener('offline', () => {
        this.setNetworkState('OFFLINE');
      });
    }
  }

  private static verifiedUnreachable = false;

  /**
   * Fed by the endpoint resolver, which knows from real requests whether the cloud answered: ONLINE means
   * the cloud is reachable; LOCAL (only the branch core answers) and OFFLINE both mean "no internet" for
   * anything that needs it. Local operation is unaffected.
   */
  public static reportReachability(mode: 'ONLINE' | 'LOCAL' | 'OFFLINE'): void {
    this.verifiedUnreachable = mode !== 'ONLINE';
    const next: NetworkState = mode === 'ONLINE' ? 'ONLINE' : 'OFFLINE';
    if (this.currentState !== next && !(next === 'ONLINE' && this.currentState === 'SYNCING')) this.setNetworkState(next, next === 'ONLINE' ? 18 : 0);
  }

  public static getNetworkState(): NetworkState {
    return this.currentState;
  }

  public static isOnline(): boolean {
    return this.currentState === 'ONLINE' || this.currentState === 'SYNCING';
  }

  public static getLatency(): number {
    return this.latencyMs;
  }

  public static setNetworkState(newState: NetworkState, latency: number = 18): void {
    this.currentState = newState;
    this.latencyMs = latency;
    this.notifyListeners();
  }

  public static toggleSimulatedOffline(): NetworkState {
    const next = this.currentState === 'ONLINE' ? 'OFFLINE' : 'ONLINE';
    this.setNetworkState(next, next === 'ONLINE' ? 18 : 0);
    return next;
  }

  public static subscribe(listener: (state: NetworkState, latency: number) => void): () => void {
    this.listeners.push(listener);
    listener(this.currentState, this.latencyMs);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private static notifyListeners(): void {
    this.listeners.forEach((l) => l(this.currentState, this.latencyMs));
  }
}
