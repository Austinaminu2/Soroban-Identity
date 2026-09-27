---
title: Quick Start — Deploy and Run on Testnet
slug: 02-quick-start
duration: 10:00
---

# 02 · Quick start

<!-- video:watch -->
*Video coming soon.*
<!-- /video:watch -->

**Audience:** developers who want a working local setup.
**Goal:** go from a fresh clone to contracts deployed on testnet and the dApp running locally.
**SDK version:** 0.1.0
**Written companion:** [Getting started](../../getting-started.md), [Tutorial 1](../../tutorials/01-getting-started.md)
**Setup before recording:** clean machine or container with only git and a browser with Freighter. Create and fund the `deployer` key off camera first so the recording isn't waiting on Friendbot. Never show a secret key: use `stellar keys` names.

## [00:00] Intro

**On screen:** Terminal, empty prompt. Series title card in the corner.

> In this video we'll take Soroban Identity from a fresh clone to a running app on Stellar testnet, using SDK version 0.1.0.
> You'll need Rust, the Stellar CLI, Node 20 or later, and a Stellar wallet like Freighter. If you'd rather skip the installs, the repo ships a dev container with all of it.

## [00:30] Clone the repo

**On screen:** Run the commands below, then `ls` to show the layout.

```bash
git clone https://github.com/El-Chapo-Npm/Soroban-Identity.git
cd Soroban-Identity
ls
```

> Clone the repository and take a look around.
> contracts holds the three Soroban contracts, sdk is the TypeScript SDK, frontend is the React app, server is an optional API server, and scripts has the deploy script we'll use in a minute.

## [01:10] Install Rust and the wasm target

**On screen:** Rustup install, then the target command.

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
rustup target add wasm32-unknown-unknown
```

> Soroban contracts are written in Rust and compiled to WebAssembly.
> If you don't have Rust, install it with rustup, then add the wasm32 unknown unknown target. That's the compilation target Soroban expects.

## [01:50] Install the Stellar CLI

**On screen:** Install command, then `stellar --version`.

```bash
cargo install --locked stellar-cli
stellar --version
```

> Next, the Stellar CLI. We use it to deploy contracts and to call them from the terminal.
> Installing it with cargo takes a few minutes, so I'll skip ahead.

## [02:30] Create and fund a testnet account

**On screen:** Generate the key, then print its address.

```bash
stellar keys generate deployer --network testnet --fund
stellar keys address deployer
```

> To deploy we need a testnet account with some test lumens.
> The CLI can generate a key and fund it through Friendbot in one step. I've called it deployer. The secret stays in the CLI's key store, so it never has to appear on screen.

## [03:10] Deploy with the script

**On screen:** Scroll through `scripts/deploy.sh`, then run it. Pause on the final output, then `cat .env.deployed`.

```bash
export STELLAR_SECRET_KEY=deployer
bash scripts/deploy.sh --network testnet
cat .env.deployed
```

> The deploy script builds the three contracts, deploys each one to testnet, and calls initialize with your address as admin.
> It reads your key from STELLAR SECRET KEY. The CLI accepts a key name as well as a secret, so I'm passing deployer.
> When it finishes, the contract IDs are saved to a file called dot env dot deployed in the repo root. It's git-ignored, and if you run the script again it reuses contracts that already exist instead of deploying new ones.

## [04:50] Install and build the workspace

**On screen:** Run from the repo root and let the build finish.

```bash
npm install
npm run build
```

> The SDK and the frontend are npm workspaces, so one install at the root covers both.
> npm run build compiles the SDK first, then the frontend that depends on it.

## [05:40] Configure the frontend

**On screen:** Copy the example env file and paste the IDs from `.env.deployed` into the testnet variables.

```bash
cp frontend/.env.example frontend/.env
# then set, from .env.deployed:
#   VITE_TESTNET_IDENTITY_REGISTRY_ID
#   VITE_TESTNET_CREDENTIAL_MANAGER_ID
#   VITE_TESTNET_REPUTATION_ID
```

> The frontend reads its contract IDs from environment variables, with separate sets for testnet and mainnet.
> Copy the example file and paste in the three IDs from dot env dot deployed, into the variables that start with VITE TESTNET.

## [06:40] Run the frontend

**On screen:** Start the dev server; open the local URL in the browser.

```bash
npm run dev --workspace=frontend
```

> Start the Vite dev server and open the local URL.
> There's the app: Identity, Credentials and Issuer analytics tabs, a network switcher and a wallet button in the header.
> If a contract ID is missing or wasn't initialized, a banner at the top tells you which one.

## [07:20] Connect a wallet

**On screen:** Network switcher set to Testnet. Connect, pick Freighter, approve. Show the truncated address in the header.

> Make sure the app's network switcher says Testnet, and that your wallet is on testnet too. If the two disagree, you'll be looking at different networks.
> Click connect, choose Freighter, and approve. Your address appears in the header.

## [08:00] First DID

**On screen:** Identity tab → create a DID → approve in Freighter → resolve the same address and show the document.

> Let's create our first DID. On the Identity tab, create a DID for the connected wallet and approve the transaction in your wallet.
> Then resolve your own address. There's your DID document: the did colon stellar identifier, the controller, timestamps, and active set to true.

## [08:50] Check from the CLI

**On screen:** Load the IDs and call `has_active_did`.

```bash
source .env.deployed
stellar contract invoke --id "$IDENTITY_REGISTRY_ID" --source deployer --network testnet \
  -- has_active_did --controller "$(stellar keys address deployer)"
```

> You can always check the chain directly. Load the IDs from dot env dot deployed and call has active did for our address. It returns true.
> Everything the app does is plain contract calls, so the CLI is a great debugging tool.

## [09:30] Wrap up

**On screen:** End card: *Next: DID creation (8 min)*.

> That's it: contracts on testnet, the app running locally, and your first DID.
> In the next video we'll look closely at DIDs: what's in the document, how metadata works, and how to update and deactivate one.
