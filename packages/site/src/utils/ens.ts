import { createPublicClient, http, namehash } from 'viem';
import { mainnet } from 'viem/chains';
import { normalize } from 'viem/ens';

/** Legacy single-workflow key (backward compat for loading old records) */
export const ENS_WORKFLOW_KEY_LEGACY = 'com.surecast.workflow';

/**
 * Convert a workflow name to a URL-safe slug for ENS keys.
 */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);
}

/**
 * Build per-workflow ENS key.
 * e.g. "Yield Optimizer" => "com.surecast.workflow.yield-optimizer"
 */
export function getWorkflowKey(slug: string): string {
  return `com.surecast.workflow.${slug}`;
}

// Viem client for mainnet reads — no MetaMask needed
const mainnetClient = createPublicClient({
  chain: mainnet,
  transport: http(),
});

/**
 * Read a text record from any ENS name.
 * Uses viem's Universal Resolver under the hood — handles CCIP-Read,
 * offchain names, Base names, subnames, different resolvers, etc.
 */
export async function readEnsText(name: string, key: string): Promise<string | null> {
  return mainnetClient.getEnsText({
    name: normalize(name),
    key,
  });
}

/**
 * Resolve ENS name → address.
 */
export async function resolveEnsAddress(name: string): Promise<string | null> {
  return mainnetClient.getEnsAddress({
    name: normalize(name),
  });
}

/**
 * Reverse lookup: address → ENS name.
 */
export async function lookupEnsName(address: string): Promise<string | null> {
  return mainnetClient.getEnsName({
    address: address as `0x${string}`,
  });
}

/**
 * Compute namehash with normalization (for setText calldata encoding).
 * Uses viem's built-in namehash which normalizes internally.
 */
export function computeNamehash(name: string): string {
  return namehash(normalize(name));
}
