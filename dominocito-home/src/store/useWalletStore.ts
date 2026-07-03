import { create } from 'zustand';

interface WalletBalance {
  id: number;
  balanceEur: string; // el back devuelve string para mantener precisión numérica
  updatedAt: string;
}

interface WalletState {
  balance: WalletBalance | null;
  loading: boolean;
  error: string | null;

  setBalance: (b: WalletBalance | null) => void;
  setLoading: (v: boolean) => void;
  setError: (e: string | null) => void;
  reset: () => void;
}

/**
 * Store del wallet — caché local del balance.
 * La fuente de verdad sigue siendo el backend (wallet.getBalance en tRPC).
 * Este store evita martillar el endpoint cada vez que un componente necesita
 * mostrar el balance.
 */
export const useWalletStore = create<WalletState>()((set) => ({
  balance: null,
  loading: false,
  error: null,

  setBalance: (balance) => set({ balance, error: null }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
  reset: () => set({ balance: null, loading: false, error: null }),
}));

/**
 * Helper: fetch el balance actual y cachearlo en el store.
 * Usar desde el Provider o desde un componente top-level con `useEffect`.
 */
export async function refreshWallet(
  fetcher: () => Promise<{ id: number; balance_eur: string; updated_at: string }>
): Promise<void> {
  const store = useWalletStore.getState();
  store.setLoading(true);
  store.setError(null);
  try {
    const data = await fetcher();
    store.setBalance({
      id: data.id,
      balanceEur: data.balance_eur,
      updatedAt: data.updated_at,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error desconocido';
    store.setError(msg);
  } finally {
    store.setLoading(false);
  }
}
