---
title: Integrating Soroban Identity into Your dApp
slug: 05-integration-guide
duration: 20:00
---

# 05 · Integration guide

<!-- video:watch -->
*Video coming soon.*
<!-- /video:watch -->


**Audience:** developers adding Soroban Identity to an existing Stellar app.
**Goal:** build a KYC-gated feature end to end: SDK setup, wallet connection, gating in the UI, server-side enforcement, reputation checks, error handling, and moving to mainnet.
**SDK version:** 0.1.0
**Written companion:** [SDK tutorials](../../tutorials/README.md), [Tutorial 4: Reputation system](../../tutorials/04-reputation-system.md)
**Setup before recording:** a minimal Vite + React app (`demo-app/`) and a small Express server (`demo-api/`), both with the SDK installed from the local `sdk/` folder. Testnet contracts deployed. Alice has a DID and a valid KYC credential from video 04; Bob has neither.

## [00:00] Intro

**On screen:** The finished demo: Alice connects and sees "Trade unlocked"; Bob connects and sees "Verify your identity to continue".

> In this final video, using SDK 0.1.0, we'll integrate Soroban Identity into an app.
> The example is a trading feature that only verified users can use. Alice has a KYC credential and gets in; Bob doesn't.
> We'll build the front end check, the back end enforcement, and a sybil check, then talk about errors, performance and mainnet.

## [00:40] Architecture of the integration

**On screen:** Diagram: Browser (wallet + UI gate) → API (authoritative check) → Soroban RPC → contracts.

> Here's the shape of it.
> The browser connects a wallet and does a check so the UI can show the right screen.
> But the browser can't be trusted, so our API does the authoritative check before doing anything that matters.
> Both talk to the same contracts through Soroban RPC, using the same SDK.

## [01:30] Install and configure the SDK

**On screen:** `demo-app/.env` and `src/identity.ts`.

```bash
npm install @soroban-identity/sdk @stellar/stellar-sdk
```

```ts
// src/identity.ts
import { TESTNET_CONFIG, MAINNET_CONFIG, type SorobanIdentityConfig } from "@soroban-identity/sdk";

const base = import.meta.env.VITE_NETWORK === "mainnet" ? MAINNET_CONFIG : TESTNET_CONFIG;

export const identityConfig: SorobanIdentityConfig = {
  ...base,
  identityRegistryId: import.meta.env.VITE_IDENTITY_REGISTRY_ID,
  credentialManagerId: import.meta.env.VITE_CREDENTIAL_MANAGER_ID,
  reputationId: import.meta.env.VITE_REPUTATION_ID,
};
```

> Install the SDK alongside the Stellar SDK.
> Then create one config object for the whole app. Start from the testnet or mainnet preset and fill in the three contract IDs from environment variables.
> Keeping IDs in env vars means switching networks is a config change, not a code change.

## [03:00] Connecting a wallet

**On screen:** `frontend/src/hooks/useWallet.ts` from the reference app, then the demo's connect button.

> For wallets, the reference frontend has a useWallet hook built on Stellar Wallets Kit, so it supports Freighter and other Stellar wallets. Feel free to copy it.
> All we need from the wallet right now is the user's public key. Every check in this video is a read, so the user never has to sign anything to be verified.

## [04:00] The front-end gate

**On screen:** `src/useVerification.ts`. Type it out.

```ts
import { useEffect, useState } from "react";
import { IdentityClient, CredentialClient } from "@soroban-identity/sdk";
import { identityConfig } from "./identity";

const identity = new IdentityClient(identityConfig);
const credentials = new CredentialClient(identityConfig);

export type Gate = "loading" | "no-did" | "no-kyc" | "ok";

export function useVerification(address: string | null): Gate {
  const [gate, setGate] = useState<Gate>("loading");

  useEffect(() => {
    if (!address) return;
    let cancelled = false;
    (async () => {
      if (!(await identity.hasActiveDid(address))) return !cancelled && setGate("no-did");
      const creds = await credentials.getCredentialsBySubject(address, address);
      const now = Date.now() / 1000;
      const kyc = creds.some(
        (c) =>
          c.credentialType === "Kyc" &&
          !c.revoked &&
          !c.activationCancelled &&
          c.activationTime <= now &&
          (c.expiresAt === 0 || c.expiresAt > now)
      );
      if (!cancelled) setGate(kyc ? "ok" : "no-kyc");
    })();
    return () => { cancelled = true; };
  }, [address]);

  return gate;
}
```

> Here's a hook that answers one question: can this user trade?
> First, does the address have an active DID? If not, we send them to create one.
> Then we list their credentials and look for a KYC credential that isn't revoked, has become active, and hasn't expired.
> We return a small state machine, so the UI can show loading, create your DID, get verified, or unlocked.

## [06:00] Using the gate

**On screen:** `TradePanel.tsx` with the four states, then the browser: switch between Alice and Bob in Freighter.

```tsx
const gate = useVerification(wallet.publicKey);
if (gate === "loading") return <Spinner />;
if (gate === "no-did") return <CreateDidPrompt />;
if (gate === "no-kyc") return <GetVerifiedPrompt />;
return <TradeForm />;
```

> In the component, switch on the gate.
> Connect as Alice, and the trade form appears. Switch Freighter to Bob, and we're asked to create a DID first.
> Each state gets a next step, never just a locked door.

## [07:10] Accepting only trusted issuers

**On screen:** Add an `ACCEPTED_ISSUERS` set and filter on `c.issuer`.

```ts
const ACCEPTED_ISSUERS = new Set(import.meta.env.VITE_ACCEPTED_ISSUERS.split(","));
// ...
(c) => c.credentialType === "Kyc" && ACCEPTED_ISSUERS.has(c.issuer) && /* ... */
```

> Any registered issuer can issue a KYC credential, but your compliance team probably trusts only some of them.
> Keep your own allowlist of issuer addresses and check the credential's issuer against it.
> This also protects you if an issuer is later removed from the registry, because credentials it already issued stay valid on-chain.

## [08:15] Why the front end isn't enough

**On screen:** Browser devtools: override the hook's return value to "ok" and show the form appears for Bob.

> Now watch this. With devtools I can force the hook to return OK, and Bob sees the trade form.
> Front-end checks are for user experience. Anything that matters, like accepting an order, must be checked again on the server.

## [09:00] Server-side verification

**On screen:** `demo-api/src/requireKyc.ts`.

```ts
import { CredentialClient, TESTNET_CONFIG } from "@soroban-identity/sdk";

const credentials = new CredentialClient({ ...TESTNET_CONFIG, /* contract IDs */ });
const READ_ACCOUNT = process.env.READ_ACCOUNT!; // any valid address; reads are simulations and nothing is signed

export async function requireKyc(req, res, next) {
  const { address, credentialId } = req.auth; // from your wallet-signature login
  const cred = await credentials.getCredential(READ_ACCOUNT, credentialId);
  if (cred.subject !== address || cred.credentialType !== "Kyc" || !ACCEPTED_ISSUERS.has(cred.issuer)) {
    return res.status(403).json({ error: "credential does not belong to this user" });
  }
  const result = await credentials.verifyCredential(READ_ACCOUNT, credentialId);
  if (!result.valid) return res.status(403).json({ error: `credential ${result.reason}` });
  next();
}
```

> On the server, write a middleware that runs before any protected route.
> Two checks, in this order. First, fetch the credential and make sure it actually belongs to the logged-in address, is a KYC credential, and comes from an issuer we accept. Otherwise anyone could present someone else's credential ID.
> Second, verify it, so we catch revocation and expiry.
> If either fails, return 403 with the reason.

## [11:00] Proving address ownership

**On screen:** Slide: *Challenge → wallet signs → server verifies signature → session*.

> That middleware assumes req.auth.address really belongs to the caller. Soroban Identity doesn't handle login for you.
> The usual pattern is a challenge: the server sends a random nonce, the wallet signs it, and the server checks the signature against the address before starting a session.
> Only then do you trust the address, and only then do the identity checks mean anything.

## [11:50] Adding a sybil check

**On screen:** Extend the middleware with `passesSybilCheck`.

```ts
import { ReputationClient } from "@soroban-identity/sdk";
const reputation = new ReputationClient(config);

const human = await reputation.passesSybilCheck(READ_ACCOUNT, address, 50, 2);
if (!human) return res.status(403).json({ error: "insufficient reputation" });
```

> For things like airdrops or voting, KYC may be overkill but you still want one person, one account.
> The reputation contract's passes sybil check does exactly that: does this address have at least a minimum score, from at least a minimum number of independent reporters?
> Here we require a score of fifty from at least two reporters. Needing multiple reporters makes it much harder to game than a single score.

## [13:00] Becoming a reporter

**On screen:** `submitScore` call from a backend job.

```ts
await reputation.submitScore(reporterKeypair, address, +5, "completed_trade");
```

> Your app can contribute reputation too. Once the reputation admin registers your backend as a reporter, submit score deltas as users do good things, like completing trades without disputes.
> Keep the reason short and machine-readable. It's stored in the subject's history.

## [13:50] Error handling

**On screen:** Wrap the hook's body in try/catch; show a network error state in the UI.

> Everything here goes over the network, so plan for failure.
> RPC calls can time out or be rate-limited. Catch errors and show a retry state instead of treating failure as not verified. You don't want a flaky connection to tell a verified user they aren't verified.
> On the server it's the other way round: fail closed. If you can't verify, don't allow the action.

## [14:50] Performance and caching

**On screen:** Slide: *Cache per address, short TTL · Re-verify on sensitive actions · Batch lookups*.

> Each check is a simulation round trip, typically a few hundred milliseconds.
> On the server, cache results per address for a short time, a minute or so, so a burst of requests doesn't mean a burst of RPC calls.
> But always re-verify right before high-value actions, since a revocation should take effect immediately.

## [15:50] Issuing from your own backend

**On screen:** Backend route `POST /kyc/webhook` that calls `issueCredential` after a KYC vendor webhook.

```ts
app.post("/kyc/webhook", verifyVendorSignature, async (req, res) => {
  const { address, level } = req.body;
  const claims = { level: String(level) };
  const claimsHashHex = createHash("sha256").update(JSON.stringify(claims)).digest("hex");
  const issued = await credentials.issueCredential(issuerKeypair, address, "Kyc", claims, claimsHashHex, oneYearFromNow());
  await db.users.update(address, { kycCredentialId: issued.data.credentialId });
  res.sendStatus(204);
});
```

> If you're the one doing KYC, you're also an issuer.
> A common setup: your KYC vendor calls a webhook when a user passes, and your backend hashes the claims and issues the credential with a key registered as an issuer.
> Keep the issuer's secret key in a secrets manager, never in the front end, and store the credential ID so you can revoke it later.

## [17:00] Moving to mainnet

**On screen:** Checklist slide.

> When you're ready for mainnet, here's the checklist.
> Deploy the contracts to mainnet and initialize them with an admin you control, ideally a multisig account.
> Register your production issuers and reporters.
> Switch your config to MAINNET CONFIG with the new contract IDs, and update your accepted issuers list, because mainnet addresses are different.
> Make sure wallets are on the right network, since a user on testnet will simply look unverified.
> And use a reliable RPC provider for production traffic.

## [18:30] Testing your integration

**On screen:** Test file mocking `CredentialClient` with the four `VerifyResult` shapes.

> For automated tests, mock the SDK clients rather than hitting the network.
> Cover each state: no DID, no credential, each failure reason including not yet active, and valid. Then run a manual pass on testnet before every release.

## [19:15] Wrap up

**On screen:** End card with links: repo, docs, the full playlist.

> That's the whole series. You've seen the protocol, deployed it, managed DIDs and credentials, and integrated it into an app with proper server-side enforcement.
> Links to the code, the docs and the rest of the playlist are in the description. Thanks for watching, and happy building.
