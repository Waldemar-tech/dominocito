export interface Wallet {
  balance: number;       // EUR disponibles
  historial: Transaction[];
}

export interface Transaction {
  id: string;
  tipo: 'deposito' | 'apuesta' | 'premio';
  amount: number;
  descripcion: string;
  timestamp: Date;
}

export function crearWallet(balanceInicial: number = 100): Wallet {
  return {
    balance: balanceInicial,
    historial: [
      {
        id: crypto.randomUUID(),
        tipo: 'deposito',
        amount: balanceInicial,
        descripcion: 'Saldo inicial de prueba',
        timestamp: new Date(),
      }
    ],
  };
}

export function apostar(wallet: Wallet, amount: number): { ok: boolean; error?: string } {
  if (wallet.balance < amount) return { ok: false, error: 'Saldo insuficiente' };
  wallet.balance -= amount;
  wallet.historial.push({
    id: crypto.randomUUID(),
    tipo: 'apuesta',
    amount: -amount,
    descripcion: `Apuesta de €${amount.toFixed(2)}`,
    timestamp: new Date(),
  });
  return { ok: true };
}

export function acreditarPremio(wallet: Wallet, amount: number, descripcion: string): void {
  wallet.balance += amount;
  wallet.historial.push({
    id: crypto.randomUUID(),
    tipo: 'premio',
    amount,
    descripcion,
    timestamp: new Date(),
  });
}
