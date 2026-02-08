# Surecast

DeFi workflow composer for MetaMask Snaps. Compose multi-step DeFi workflows (swap, bridge, deposit, stake), persist them to ENS text records, and execute seamlessly across 5 EVM chains.

## What It Does

Surecast lets you build reusable DeFi workflows inside MetaMask:

1. **Compose** - Add steps (swap, deposit into Aave, stake with Lido) in the MetaMask Snap UI
2. **Chain** - Output from one step automatically feeds into the next
3. **Execute** - Run the entire workflow from the companion site, one transaction per step
4. **Save to ENS** - Persist workflows on-chain as ENS text records for replay and sharing
5. **Share** - Anyone can load your workflow by ENS name and run it themselves

### Supported Actions

| Action | Protocols | Chains |
|--------|-----------|--------|
| Swap | Any token pair via LI.FI | Ethereum, Arbitrum, Optimism, Base, Polygon |
| Bridge | Cross-chain swaps via LI.FI | All 5 chains |
| Deposit | Aave V3 (aTokens) | All 5 chains |
| Stake | Lido (wstETH), EtherFi (weETH) | Ethereum (cross-chain entry via any chain) |

### Safety Features

- Gas estimation per step (~$X.XX)
- Slippage warnings when exceeding 2% threshold
- Estimated execution time per step
- Error recovery with retry from failed step

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Snap Runtime | MetaMask Snaps SDK v10.3, SES sandbox |
| Snap UI | Snaps JSX (Box, Form, Dropdown, Button, Banner) |
| Site Framework | Gatsby 5, React 18 |
| Cross-chain | LI.FI API (`/v1/quote`) with Composer for DeFi actions |
| ENS | Custom ABI encoding (setText, text, multicall) on ENS Public Resolver |
| Hashing | @noble/hashes (keccak256 for ENS namehash) |
| Styling | Inline CSSProperties |
| Language | TypeScript 5.7 |
| Package Manager | pnpm |
| Node | v20 |

## Architecture

```
MetaMask Snap (SES sandbox)           Gatsby Site
===========================           ===========
- Workflow composer UI                - Workflow executor
- LI.FI quote fetching               - Transaction submission (eth_sendTransaction)
- State management (snap_manageState) - Chain switching
- ENS calldata encoding              - ENS namehash computation
- Compact serialization              - ENS text record reads
                                      - Step progress + safety warnings

          Snap <──── wallet_invokeSnap RPC ────> Site
```

The snap composes workflows and prepares transactions. The site drives execution because snaps cannot send transactions directly. Communication happens via `wallet_invokeSnap` RPC calls.

LI.FI Composer auto-detects vault/staking token addresses passed as `toToken` in `/v1/quote` and composes swap + bridge + deposit/stake into a single transaction. No custom contract interactions needed for DeFi actions.

## Prerequisites

- **Node.js v20** (see `.nvmrc`)
- **pnpm** - `npm install -g pnpm`
- **MetaMask Flask** - Required for snap development. Install from [https://metamask.io/flask/](https://metamask.io/flask/). Disable regular MetaMask if installed, as they conflict.

## Getting Started

### 1. Clone and install

```bash
git clone <repo-url>
cd surecast
pnpm install
```

### 2. Build the snap

```bash
pnpm --filter snap build
```

### 3. Start development servers

Start both the snap (watch mode) and the Gatsby dev site concurrently:

```bash
pnpm start
```

Or start them individually:

```bash
# Snap - rebuilds on file changes
pnpm --filter snap start

# Site - http://localhost:8000
pnpm --filter site start
```

### 4. Connect the Snap

1. Open **MetaMask Flask** in your browser
2. Navigate to `http://localhost:8000`
3. Click **Connect** to install the snap
4. Open the Surecast home page from MetaMask's Snap UI to start composing workflows

## Available Commands

| Command | Description |
|---------|-------------|
| `pnpm install` | Install all dependencies |
| `pnpm start` | Start snap (watch) + site (dev) concurrently |
| `pnpm build` | Build both snap and site |
| `pnpm --filter snap build` | Build the snap bundle |
| `pnpm --filter snap start` | Start snap in watch mode |
| `pnpm --filter site build` | Build the Gatsby site for production |
| `pnpm --filter site start` | Start Gatsby dev server on port 8000 |
| `pnpm --filter snap test` | Run snap unit tests |
| `pnpm lint` | Lint the entire project |
| `pnpm lint:fix` | Auto-fix lint issues |

## Deployment

### Site

Build the Gatsby site for static deployment:

```bash
pnpm --filter site build
```

Output is in `packages/site/public/`. Deploy to any static hosting provider:

- **Vercel**: `vercel --cwd packages/site`
- **Netlify**: Build command `cd packages/site && pnpm build`, publish directory `packages/site/public`
- **GitHub Pages**: Push `packages/site/public/` to a `gh-pages` branch
- **IPFS**: Pin the `public/` directory for decentralized hosting

### Snap

For production, the snap is published to npm and referenced by the deployed site:

```bash
cd packages/snap
pnpm build
npm publish
```

Update `snap.manifest.json` with the published package name and registry. The deployed site will prompt users to install the snap from npm when they connect.

### Backend

There is no backend server. The entire application is client-side:

- **Transactions**: Submitted via MetaMask (`eth_sendTransaction`)
- **DeFi quotes**: Fetched from LI.FI API (`/v1/quote`) directly from the snap
- **ENS reads**: Raw `eth_call` to public Ethereum RPC (`ethereum-rpc.publicnode.com`)
- **ENS writes**: `setText` transactions via MetaMask on Ethereum mainnet
- **State**: Persisted in MetaMask's snap storage (`snap_manageState`)

## Project Structure

```
surecast/
  packages/
    snap/
      src/
        index.tsx           # Snap entry (lifecycle handlers, routing)
        rpc.ts              # RPC handlers (prepareStepQuote, startExecution, etc.)
        types.ts            # Shared TypeScript types
        state.ts            # State management with in-memory cache
        helpers.ts          # Utilities (generateId, parseAmount, chainNameToId)
        ui/
          index.tsx         # Home screen, swap form, workflow list renderers
          defi-forms.tsx    # Deposit and stake form renderers
        handlers/
          index.tsx         # Swap, quote, rename, save/load handlers
          defi.tsx          # Deposit and stake submit handlers
        services/
          lifi.ts           # LI.FI /v1/quote integration
          ens.ts            # ENS ABI encoding, serialization, multicall, text reads
        data/
          chains.ts         # Chain IDs and display names
          tokens.ts         # Token addresses per chain
          vaults.ts         # Vault/staking token registry (Aave V3, Lido, EtherFi)
      snap.manifest.json    # Snap permissions and metadata
    site/
      src/
        pages/
          index.tsx         # Executor UI, ENS management, step progress bar
        utils/
          ens.ts            # Namehash, text record encoding/decoding, slugify
        components/
          Header.tsx        # Surecast branding
```

## How ENS Persistence Works

Workflows are saved to ENS text records on the ENS Public Resolver contract:

- **Workflow data**: `com.surecast.workflow.<slug>` - compact JSON with short keys to minimize gas
- **Manifest**: `com.surecast.workflows` - index of all saved workflow slugs and names
- **Multicall**: Both records updated in a single transaction via `multicall(bytes[])`

The site computes the ENS namehash (keccak256 via @noble/hashes) and the snap encodes `setText` calldata. All ABI encoding is hand-rolled - no external ENS or ethers libraries.

## License

Open source for the Hackmoney hackathon.