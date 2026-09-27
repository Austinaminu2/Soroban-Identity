---
title: DIDs on Stellar — Create, Resolve, Update, Deactivate
slug: 03-did-creation
duration: 08:00
---

# 03 · DID creation

<!-- video:watch -->
*Video coming soon.*
<!-- /video:watch -->

**Audience:** developers who completed the quick start.
**Goal:** understand the DID document and manage a DID end to end with the SDK.
**SDK version:** 0.1.0
**Written companion:** [Tutorial 2: DID management](../../tutorials/02-did-management.md)
**Setup before recording:** contracts deployed (video 02), `.env.deployed` present, a funded testnet key named `alice` with no DID yet, and a scratch file `did-demo.ts` in a project that depends on the SDK. Export `ALICE_SECRET` from the key store off camera.

## [00:00] Intro

**On screen:** Title card, then `contracts/identity-registry/src/lib.rs` open at `DidDocument`.

> In this video, recorded with SDK 0.1.0, we'll look at decentralized identifiers on Stellar: what a DID document contains, and how to create, resolve, update and deactivate one.

## [00:20] The did:stellar method

**On screen:** README "DID Format" section.

> A Soroban Identity DID is did colon stellar colon, followed by a Stellar address.
> Because the identifier comes from the address, there's exactly one DID per wallet, and anyone can work out a wallet's DID without asking the chain.

## [00:50] Anatomy of a DID document

**On screen:** Highlight the fields of `DidDocument` as they are mentioned.

> The contract stores a DID document for each controller.
> id is the DID string. controller is the wallet that owns it, and only that wallet can change it.
> metadata is a map of strings to strings, for things like a display name or a website. There are also service endpoints, for pointing to APIs that act for this identity.
> created at and updated at are ledger timestamps, and active says whether the DID is still in use.

## [01:40] Create a DID with the SDK

**On screen:** Type the snippet into `did-demo.ts` and run it with `npx tsx did-demo.ts`.

```ts
import { Keypair } from "@stellar/stellar-sdk";
import { IdentityClient, TESTNET_CONFIG } from "@soroban-identity/sdk";

const identity = new IdentityClient({
  ...TESTNET_CONFIG,
  identityRegistryId: process.env.IDENTITY_REGISTRY_ID!,
  credentialManagerId: process.env.CREDENTIAL_MANAGER_ID!,
  reputationId: process.env.REPUTATION_ID!,
});

const alice = Keypair.fromSecret(process.env.ALICE_SECRET!);
const created = await identity.createDid(alice, { name: "Alice", country: "NG" });
console.log(created.data.did, created.txHash, created.data.estimatedFeeXlm);
```

> Let's create a DID for Alice.
> Build an IdentityClient from the testnet config plus the three contract IDs, then call create DID with Alice's keypair and some metadata.
> The SDK builds the transaction, simulates it to get the resource footprint and fee, signs it with Alice's key, submits it, and waits for confirmation.
> Every write in the SDK returns the same shape: data, here the new DID and the estimated fee, plus the transaction hash, so you can link to it in an explorer.

## [03:00] Authorization

**On screen:** `create_did` in the contract. Highlight `controller.require_auth()`.

> Notice the first check in create did: controller dot require auth.
> Soroban verifies that the controller actually signed the transaction. You can't create, update or deactivate a DID for someone else's wallet.
> And if Alice tries to create a second DID, the contract rejects it, and the SDK throws an error that says so.

## [03:40] Resolve and check

**On screen:** Append to the script and run it again.

```ts
const doc = await identity.resolveDid(alice.publicKey());
console.log(doc);

console.log(await identity.hasActiveDid(alice.publicKey()));
```

> resolve DID returns the full document, with metadata as a plain object and timestamps as numbers.
> For a simple yes or no, for example to gate a feature, use has active DID. It returns false both for addresses with no DID and for deactivated ones, so you don't need a try/catch.
> Reads are simulations: they're free and nothing is signed.

## [04:40] Update metadata

**On screen:** Append, run, resolve again and point at the changed `updatedAt`.

```ts
await identity.updateDid(alice, {
  name: "Alice Doe",
  country: "NG",
  website: "https://alice.example",
});
```

> To change metadata, call update DID with the controller's keypair.
> One thing to know: update replaces the whole metadata map rather than merging, and it can't be empty. Send every key you want to keep.
> Resolve again and you'll see the new metadata and a fresh updated at.

## [05:50] Deactivate

**On screen:** Append and run; then `hasActiveDid` returns false and `resolveDid` still returns the document with `active: false`.

```ts
await identity.deactivateDid(alice);
console.log(await identity.hasActiveDid(alice.publicKey())); // false
```

> Deactivation is a soft delete. The document stays on-chain for auditability, but active flips to false.
> Only the contract admin can reactivate a DID, so treat deactivation as permanent in your app.
> Apps should check has active DID, not just whether a document exists.

## [06:50] Good metadata practice

**On screen:** Slide: *Do* (display name, website, ISO country code) / *Don't* (email, birth date, document numbers).

> A quick word on metadata: it's public. Anyone can read it, forever.
> Put things there you'd put on a business card: a display name, a website, a country code if you want to be counted in network analytics.
> Never put personal data like emails, birth dates or document numbers in metadata. That's what credentials are for, and they're the next video.

## [07:35] Wrap up

**On screen:** End card: *Next: Credential lifecycle (15 min)*.

> You can now create, resolve, update and deactivate a DID.
> Next, we'll issue, verify and revoke verifiable credentials, the part that makes identity useful.
