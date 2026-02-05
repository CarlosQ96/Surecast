import { CHAIN_NAMES, CHAINS } from './data/chains';

let idCounter = 0;
export function generateId(): string {
  idCounter += 1;
  return `${Date.now().toString(36)}-${idCounter}`;
}

export function chainNameToId(name: string): number {
  const entry = Object.entries(CHAIN_NAMES).find(([, n]) => n === name);
  return entry ? Number(entry[0]) : CHAINS.ARBITRUM;
}

export function parseAmount(human: string, decimals: number): string {
  const parts = human.split('.');
  const intPart = parts[0] ?? '0';
  const fracPart = (parts[1] ?? '').padEnd(decimals, '0').slice(0, decimals);
  return `${intPart}${fracPart}`.replace(/^0+/, '') || '0';
}
