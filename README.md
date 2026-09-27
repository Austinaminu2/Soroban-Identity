# Soroban Identity

> **Decentralized Identity for a Trustless World.**

Soroban Identity is a decentralized identity (DID) and credential management protocol built on [Soroban](https://soroban.stellar.org/) — the smart contract platform of the Stellar network. It enables users to create, own, and manage verifiable on-chain identities linked to their wallets, while allowing applications to securely verify credentials without exposing sensitive data.

---

## Why Soroban Identity?

In the current Web3 ecosystem:

- Users lack persistent, verifiable identities
- Reputation is fragmented across platforms
- Compliance (KYC/AML) is difficult to implement in a decentralized way
- Sensitive user data is overexposed or centrally stored

Soroban Identity fixes this by providing a **privacy-preserving identity layer** that any dApp on Stellar can plug into.

---

## Core Features

**Decentralized Identity (DID)**

- Wallet-linked identity profiles using the `did:stellar:` method
- Unique on-chain identifiers, W3C DID-compatible
- Portable across multiple dApps

**Verifiable Credentials**

- KYC verification badges issued by trusted entities
- Proof of reputation, activity, or achievements
- Cryptographic attestations stored on-chain

**Privacy-Preserving Verification**

- Selective disclosure of identity data
- Permission-based access to credentials
- Zero-knowledge proof (ZKP) integration — future-ready

**Reputation Layer**

- On-chain activity scoring via trusted reporters
- Anti-sybil mechanisms with configurable thresholds
- Trust signals for marketplaces, DAOs, and DeFi

---

## Repo Structure

```
soroban-identity/
├── contracts/
│   ├── identity-registry/     # DID creation, update, deactivation, resolution
│   ├── credential-manager/    # Issue, verify, and revoke verifiable credentials
│   └── reputation/            # On-chain scoring and anti-sybil checks
├── frontend/                  # React + TypeScript dApp (Vite)
├── sdk/                       # TypeScript SDK for dApp integration
├── server/                    # Operational API, expiry jobs, health, and metrics
├── analytics/                 # On-chain analytics indexer + live dashboard
├── infrastructure/
│   └── cdn/                   # CDN config, cache purge, multi-region tests, metrics
├── scripts/
│   └── deploy.sh              # Build + deploy all contracts to testnet
└── docs/
    └── architecture.md        # Protocol architecture deep-dive
```

---

## Server Operations

The `server/` package provides contract health checks, protected admin issuer management, credential expiry reporting and notifications, and Prometheus metrics. See [`docs/server-operations.md`](docs/server-operations.md) for configuration and scrape examples.

---

## Smart Contracts

### `identity-registry`

Manages W3C-aligned DID documents on-chain.

| Function                           | Description                 |
| ---------------------------------- | --------------------------- |
| `initialize(admin)`                | One-time setup              |
| `create_did(controller, metadata)` | Mint a new DID for a wallet |
| `update_did(controller, metadata)` | Update DID metadata         |
| `deactivate_did(controller)`       | Soft-delete a DID           |
| `resolve_did(controller)`          | Fetch a full DID document   |
| `has_active_did(controller)`       | Boolean active check        |

### `credential-manager`

Issues and verifies verifiable credentials.

| Function                                                        | Description                                    |
| --------------------------------------------------------------- | ---------------------------------------------- |
| `initialize(admin)`                                             | One-time setup                                 |
| `add_issuer(issuer)`                                            | Register a trusted issuer (admin only)         |
| `remove_issuer(issuer)`                                         | Remove an issuer (admin only)                  |
| `issue_credential(issuer, subject, type, claims, sig, expires)` | Issue a credential                             |
| `revoke_credential(issuer, id)`                                 | Revoke a credential                            |
| `verify_credential(id)`                                         | Check if a credential is valid and not expired |
| `get_credential(id)`                                            | Fetch full credential data                     |

### `reputation`

On-chain activity scoring and anti-sybil layer.

| Function                                                | Description                              |
| ------------------------------------------------------- | ---------------------------------------- |
| `initialize(admin)`                                     | One-time setup                           |
| `add_reporter(reporter)`                                | Register a trusted reporter (admin only) |
| `submit_score(reporter, subject, delta, reason)`        | Submit a score delta                     |
| `get_reputation(subject)`                               | Get aggregated reputation record         |
| `get_history(subject, reporter)`                        | Get score history from a reporter        |
| `passes_sybil_check(subject, min_score, min_reporters)` | Anti-sybil gate                          |

---

## DID Format

```
did:stellar:<bech32-stellar-address>
```

Example:

```
did:stellar:GABC1234XYZ...
```

This is W3C DID-compatible and portable across any dApp that integrates the SDK.

---

## Credential Flow

```
Issuer                    Subject                  Verifier
  │                          │                         │
  │─── issue_credential ────▶│                         │
  │                          │──── present cred id ───▶│
  │                          │                         │─── verify_credential
  │                          │                         │◀── true / false
```

---

## API Reference

The full API contract — SDK and contract operations — is defined in
[`docs/openapi.yaml`](docs/openapi.yaml) as an OpenAPI 3.0 spec. Each operation
carries an `x-soroban-contract` extension naming the Soroban contract and
function it maps to.

Run the spec locally:

```bash
node scripts/serve-openapi.mjs        # http://localhost:3030/openapi.yaml
```

Regenerate the SDK's TypeScript types from the spec:

```bash
npx openapi-typescript docs/openapi.yaml -o sdk/src/openapi-types.ts
```

## TypeScript SDK

Install:

```bash
cd sdk && npm install
```

Usage:

```ts
import {
  IdentityClient,
  CredentialClient,
  ReputationClient,
  TESTNET_CONFIG,
  MAINNET_CONFIG,
} from "@soroban-identity/sdk";

// Testnet — spread and override the three contract IDs after deployment
const config = {
  ...TESTNET_CONFIG,
  identityRegistryId: "YOUR_REGISTRY_CONTRACT_ID",
  credentialManagerId: "YOUR_CREDENTIAL_CONTRACT_ID",
  reputationId: "YOUR_REPUTATION_CONTRACT_ID",
};

// Mainnet — same pattern, different base config
// const config = {
//   ...MAINNET_CONFIG,
//   identityRegistryId: "YOUR_REGISTRY_CONTRACT_ID",
//   credentialManagerId: "YOUR_CREDENTIAL_CONTRACT_ID",
//   reputationId: "YOUR_REPUTATION_CONTRACT_ID",
// };

// Resolve a DID
const identity = new IdentityClient(config);
const doc = await identity.resolveDid("GABC...");

// Verify a credential
const credentials = new CredentialClient(config);
const valid = await credentials.verifyCredential(
  "GABC...",
  "credential-id-hex",
);

// Check reputation / anti-sybil
const reputation = new ReputationClient(config);
const passes = await reputation.passesSybilCheck(
  "GABC...",
  "GSUBJECT...",
  50,
  2,
);
```

---

## Frontend

React + Vite dApp with Freighter wallet integration.

```bash
cd frontend
npm install
npm run dev
```

Features:

- Connect Freighter wallet
- Resolve any DID by Stellar address
- Create your own on-chain DID
- Verify credentials by ID
- Issue credentials (registered issuers)
- Export credentials as PDF (with a verification QR code), JSON (W3C VC + export metadata), XML or CSV, individually or in batches (one combined file or a ZIP), using built-in or custom PDF templates

---

## Quick Start

### Prerequisites

- [Rust](https://rustup.rs/) + `wasm32-unknown-unknown` target
- [Stellar CLI](https://developers.stellar.org/docs/tools/developer-tools/cli/stellar-cli)
- Node.js 18+
- [Freighter Wallet](https://freighter.app) browser extension

```bash
# 1. Install Rust wasm target
rustup target add wasm32-unknown-unknown

# 2. Build all contracts
cd contracts && cargo build --target wasm32-unknown-unknown --release

# 3. Deploy to testnet (set your secret key first)
export STELLAR_SECRET_KEY=S...
bash scripts/deploy.sh
# Contract IDs are saved to deployed.env in the repo root (git-ignored)

# 4. Install and run the frontend
cd frontend && npm install && npm run dev

# 5. Install and build the SDK
cd sdk && npm install && npm run build
```

### Frontend Environment Configuration

The frontend uses environment variables for configuration. Copy `.env.example` to `.env` and fill in the contract IDs after deployment:

```bash
cd frontend
cp .env.example .env
```

Edit `.env` with your deployment values:

```env
VITE_RPC_URL=https://soroban-testnet.stellar.org
VITE_NETWORK_PASSPHRASE=Test SDF Network ; September 2015
VITE_IDENTITY_REGISTRY_ID=YOUR_REGISTRY_CONTRACT_ID
VITE_CREDENTIAL_MANAGER_ID=YOUR_CREDENTIAL_CONTRACT_ID
VITE_REPUTATION_ID=YOUR_REPUTATION_CONTRACT_ID
```

**Environment Variables:**

- `VITE_RPC_URL` — Soroban RPC endpoint URL (default: `https://soroban-testnet.stellar.org`)
- `VITE_NETWORK_PASSPHRASE` — Network passphrase for transaction signing
- `VITE_IDENTITY_REGISTRY_ID` — Identity registry contract ID (required)
- `VITE_CREDENTIAL_MANAGER_ID` — Credential manager contract ID (required)
- `VITE_REPUTATION_ID` — Reputation contract ID (required)

**Note:** `.env` is git-ignored. Only commit `.env.example` to the repository.

### Deployment Configuration

The `scripts/deploy.sh` script supports configurable network and RPC endpoint via environment variables:

```bash
# Deploy to testnet (default)
export STELLAR_SECRET_KEY=S...
bash scripts/deploy.sh

# Deploy to mainnet
export STELLAR_SECRET_KEY=S...
export STELLAR_NETWORK=mainnet
export STELLAR_RPC_URL=https://soroban-mainnet.stellar.org
bash scripts/deploy.sh

# Deploy to custom network
export STELLAR_SECRET_KEY=S...
export STELLAR_NETWORK=custom
export STELLAR_RPC_URL=https://your-rpc-endpoint.com
bash scripts/deploy.sh
```

**Environment Variables:**

- `STELLAR_NETWORK` — Network name (default: `testnet`). Can be `testnet`, `mainnet`, or a custom network name.
- `STELLAR_RPC_URL` — RPC endpoint URL (default: `https://soroban-testnet.stellar.org`).
- `STELLAR_SECRET_KEY` — Your Stellar secret key (required). Used to sign transactions and deploy contracts.

### Retry Behavior

The deploy script includes automatic retry with exponential backoff for transient RPC failures (e.g., 503 errors or timeouts):

- **Default max retries:** 3 attempts
- **Initial delay:** 2 seconds
- **Backoff:** Delay doubles after each failed attempt (2s → 4s → 8s)

You can configure retry behavior via environment variables:

```bash
# Use default retry settings
export STELLAR_SECRET_KEY=S...
bash scripts/deploy.sh

# Increase max retries for unstable networks
export STELLAR_SECRET_KEY=S...
export MAX_RETRIES=5
bash scripts/deploy.sh

# Increase initial delay for slower networks
export STELLAR_SECRET_KEY=S...
export RETRY_DELAY=5
bash scripts/deploy.sh

# Custom retry configuration
export STELLAR_SECRET_KEY=S...
export MAX_RETRIES=4
export RETRY_DELAY=3
bash scripts/deploy.sh
```

**Retry Environment Variables:**

- `MAX_RETRIES` — Maximum number of retry attempts (default: `3`)
- `RETRY_DELAY` — Initial delay in seconds before first retry (default: `2`)

---

## Video Tutorials

<!-- videos:start -->
1. Introduction *(coming soon)* (05:00)
2. Quick Start on Testnet *(coming soon)* (10:00)
3. Creating and Managing DIDs *(coming soon)* (08:00)
4. The Credential Lifecycle *(coming soon)* (15:00)
5. Integration Guide *(coming soon)* (20:00)

Scripts, captions and transcripts are in [docs/videos](docs/videos/README.md).
<!-- videos:end -->

---

## Use Cases

- **KYC verification** for DeFi and financial applications on Stellar
- **Reputation systems** for marketplaces (e.g. Stellar Mart)
- **DAO governance** — voting eligibility based on verified identity
- **Access control** for exclusive communities or gated services
- **Anti-sybil protection** for airdrops and incentive programs

---

## Roadmap

- [x] DID registry contract
- [x] Verifiable credential issuance & revocation
- [x] Reputation scoring + anti-sybil
- [x] TypeScript SDK
- [x] React frontend with Freighter integration
- [ ] Full ZKP selective disclosure
- [ ] Cross-chain identity interoperability
- [ ] Mobile identity wallet
- [ ] Identity-based credit scoring
- [ ] Integration with Stellar subscription and payment systems

---


## Server (SSE + DID Resolution)

A Node.js server is available under `/server` to support:

- Real-time contract event streaming over SSE (`GET /events`)
- W3C DID resolution endpoint (`GET /1.0/identifiers/{did}`)
- Optional Redis DID document caching (`did:{address}` TTL default `60s`)

Run locally:

```bash
cd server
cp .env.example .env
npm install
npm start
```

OpenAPI spec: `server/openapi.json`

### Verbose Logging

The server emits structured JSON logs including `requestId`, method, path, status, and duration.

- Send `X-Request-ID` to propagate your own correlation ID
- If omitted, the server generates a UUID automatically

In the SDK, you can pass a pluggable logger via `SorobanIdentityConfig.logger` to capture debug-level simulation and submission outcomes.

### Contract Event Schema

See `docs/contract-events.md` for emitted topic/payload formats by contract.

---
## Contributing

PRs are welcome. See [CONTRIBUTING.md](./CONTRIBUTING.md) for branch naming, commit style, local setup, and the PR checklist.

---

## License

MIT — built on [Stellar](https://stellar.org) / [Soroban](https://soroban.stellar.org).

## Handsoff notes

<!-- handsoff-issue-808 -->
- #808: [BE-NEW-09] Implement API gateway pattern with rate limiting and auth
