---
title: The Credential Lifecycle — Issue, Verify, Renew, Revoke
slug: 04-credential-lifecycle
duration: 15:00
---

# 04 · Credential lifecycle

<!-- video:watch -->
*Video coming soon.*
<!-- /video:watch -->

**Audience:** developers building issuer or verifier features.
**Goal:** take a credential through its whole life: issuer registration, issuance, lookup, verification, expiry, renewal, revocation and issuer removal.
**SDK version:** 0.1.0
**Written companion:** [Tutorial 3: Credential lifecycle](../../tutorials/03-credential-lifecycle.md), [Contract events](../../contract-events.md)
**Setup before recording:** contracts deployed with `deployer` as admin, `.env.deployed` sourced, funded testnet keys `issuer` and `alice`, and a scratch file `cred-demo.ts`. For the expiry segment, issue a credential with a 2-minute expiry about five minutes before recording it and keep its ID in `EXPIRED_ID`.

## [00:00] Intro

**On screen:** Title card, then the README "Credential Flow" diagram.

> DIDs say who controls an identity. Credentials say something about it: this address passed KYC, this account is a DAO member, this user finished a course.
> In this video, using SDK 0.1.0, we'll follow one credential through its whole life, from issuance to revocation.

## [00:30] The three roles

**On screen:** The diagram. Highlight Issuer, Subject, then Verifier.

> Three roles are involved.
> The issuer is a trusted organization that makes a claim, like a KYC provider.
> The subject is the address the claim is about.
> The verifier is any app that wants to check the claim.
> The contract sits in the middle and enforces the rules, so the verifier never has to trust the subject.

## [01:10] Anatomy of a credential

**On screen:** The SDK's `Credential` type in `sdk/src/types.ts`; highlight fields as they are mentioned.

> Here's what a credential looks like.
> The id is a 32-byte hash. subject and issuer are addresses. The type is KYC, Reputation, Achievement or Custom.
> claims holds the assertions, like level two or tier gold, and claims hash is a SHA-256 of the claims payload, so anyone can check the claims weren't altered.
> Then there are timestamps: issued at, an optional activation time for credentials that only become valid later, and expires at, where zero means never. Finally, a revoked flag.

## [02:10] What goes in claims

**On screen:** Slide with a good claim map (`level: "2"`, `jurisdiction: "EU"`) next to a bad one (`passport: "X1234567"`, `dob: "1990-01-01"`).

> Claims are public. Store the result of a check, not the evidence.
> A KYC credential should say this person is verified at level two in the EU. It should never contain the passport number.
> The raw documents stay with the issuer, under their own data protection obligations.

## [02:55] Registering an issuer

**On screen:** Terminal. Run `add_issuer` as `deployer`. Then show that issuing from an unregistered key fails.

```bash
stellar contract invoke --id "$CREDENTIAL_MANAGER_ID" --source deployer --network testnet \
  -- add_issuer --issuer "$(stellar keys address issuer)"
```

> Not just anyone can issue credentials. The contract admin, the address that ran initialize, keeps a list of trusted issuers.
> Here the admin registers our issuer account from the CLI.
> Adding the same issuer twice does nothing, and if an unregistered address tries to issue, the contract rejects it.

## [03:55] Issuing with the SDK

**On screen:** `cred-demo.ts`. Type, run, and show the credential ID printed.

```ts
import { createHash } from "node:crypto";
import { Keypair } from "@stellar/stellar-sdk";
import { CredentialClient, TESTNET_CONFIG } from "@soroban-identity/sdk";

const credentials = new CredentialClient({
  ...TESTNET_CONFIG,
  identityRegistryId: process.env.IDENTITY_REGISTRY_ID!,
  credentialManagerId: process.env.CREDENTIAL_MANAGER_ID!,
  reputationId: process.env.REPUTATION_ID!,
});

const issuer = Keypair.fromSecret(process.env.ISSUER_SECRET!);
const claims = { level: "2", jurisdiction: "EU" };
const claimsHashHex = createHash("sha256").update(JSON.stringify(claims)).digest("hex");
const oneYear = Math.floor(Date.now() / 1000) + 365 * 24 * 3600;

const issued = await credentials.issueCredential(
  issuer,
  process.env.ALICE_ADDRESS!,
  "Kyc",
  claims,
  claimsHashHex,
  oneYear
);
const id = issued.data.credentialId;
console.log("credential id:", id);
```

> Issuing is one call. Create a CredentialClient, hash the claims with SHA-256, then call issue credential with the issuer's keypair, the subject's address, the type, the claims, the hash and an expiry.
> The expiry is a Unix timestamp in seconds, here one year from now. Pass zero for a credential that never expires.
> The response has the new credential ID in data, plus the transaction hash.
> That ID is what the subject shares with verifiers.

## [05:30] Finding a subject's credentials

**On screen:** Append and run; show the table.

```ts
const alices = await credentials.getCredentialsBySubject(issuer.publicKey(), process.env.ALICE_ADDRESS!);
console.table(alices.map((c) => ({ id: c.id.slice(0, 12), type: c.credentialType, revoked: c.revoked })));
```

> The contract keeps an index of credentials per subject, so you can list everything an address holds.
> The first argument is just the account used to build the read-only simulation. Nothing is signed.
> There's also get credentials by issuer, for the issuer's side of the same question.

## [06:30] Verifying

**On screen:** Append and run; show `{ valid: true }`.

```ts
const result = await credentials.verifyCredential(issuer.publicKey(), id);
if (result.valid) {
  console.log("credential is valid");
} else {
  console.log("invalid:", result.reason);
}
```

> Now the verifier's side. verify credential asks the contract whether this credential exists, isn't revoked, has become active, and hasn't expired.
> It returns valid, and when valid is false, a reason: not found, revoked, expired, or not yet active.
> Verification is a simulation: it's free, needs no signature, and doesn't write to the ledger. For many IDs at once, use verify credential batch.

## [07:30] Why the reason matters

**On screen:** Mock UI messages side by side: *"We couldn't find that credential"*, *"This credential was revoked by its issuer"*, *"This credential expired — ask your issuer to renew it"*, *"This credential becomes active on 1 July"*.

> Show the reason to users. "Invalid" is a dead end; "expired, ask your issuer to renew it" tells them what to do.
> The reference app's Credentials tab shows a different message for each reason.

## [08:10] Verifying in the app

**On screen:** dApp Credentials tab. Paste the ID, click Verify, show the Valid result.

> Anyone can run the same check in the app's Credentials tab: paste an ID and verify, no wallet needed.

## [08:45] Expiry and renewal

**On screen:** Verify `EXPIRED_ID` and show `{ valid: false, reason: "expired" }`. Then renew it and verify again.

```ts
console.log(await credentials.verifyCredential(issuer.publicKey(), process.env.EXPIRED_ID!));

await credentials.renewCredential(issuer, process.env.EXPIRED_ID!, oneYear);
console.log(await credentials.verifyCredential(issuer.publicKey(), process.env.EXPIRED_ID!));
```

> Before recording, I issued a credential that expired two minutes later. Verifying it now gives valid false, reason expired.
> Expiry is checked against the ledger's clock, not the verifier's, so everyone gets the same answer.
> The original issuer can renew it by setting a later expiry. Verify again, and it's valid.

## [09:55] Revocation

**On screen:** Append and run; verify again and show `reason: "revoked"`.

```ts
await credentials.revokeCredential(issuer, id);
console.log(await credentials.verifyCredential(issuer.publicKey(), id));
```

> Sometimes an issuer has to take a credential back: fraud was detected, a membership lapsed, a mistake was made.
> revoke credential marks it revoked. Only the original issuer can do this, not the subject and not even the admin.
> Verify again and you get valid false, reason revoked.
> The credential isn't deleted. It stays on-chain with its revoked flag, so there's a permanent record that it existed and was withdrawn.

## [11:05] Revocation is final

**On screen:** Slide: *Expired → renew · Revoked → issue a new credential*.

> Unlike expiry, revocation is one-way: a revoked credential can't be renewed.
> If the user becomes eligible again, issue a new credential with a new ID. That keeps the history honest.

## [11:35] Removing an issuer

**On screen:** CLI `remove_issuer` as `deployer`. Then verify a credential that issuer issued earlier and show it is still valid.

```bash
stellar contract invoke --id "$CREDENTIAL_MANAGER_ID" --source deployer --network testnet \
  -- remove_issuer --issuer "$(stellar keys address issuer)"
```

> The admin can also remove an issuer, so it can't issue anything new.
> Here's the important part: credentials it already issued stay valid.
> Removal stops future issuance; it doesn't revoke the past. If an issuer is compromised, its credentials must be revoked one by one, and the issuer has to do that itself, because only the issuer can revoke.
> Verifiers that care can also check the issuer against their own allowlist. We'll do exactly that in the integration video.

## [12:55] Lifecycle recap

**On screen:** State diagram: *Issued → (Pending) → Valid → Expired ⇄ Renewed · Valid → Revoked*, labelled with who can trigger each transition.

> So, the full lifecycle.
> The admin registers issuers. An issuer issues a credential, which may wait for its activation time, then verifies as valid.
> It stops verifying when it expires, until the issuer renews it, or for good when the issuer revokes it.
> Subjects share IDs, verifiers check them, and nobody handles the underlying personal data.

## [13:40] Events

**On screen:** An RPC `getEvents` response (or the analytics dashboard) showing `CRED issued` and `CRED revoked` events.

> Every state change also emits a contract event. CRED issued carries the credential ID, subject, issuer, type and expiry. CRED revoked carries the ID and the issuer.
> Indexers and dashboards follow these events to track issuance across the network without polling every credential.

## [14:25] Wrap up

**On screen:** End card: *Next: Integration guide (20 min)*.

> That's a credential's whole life.
> In the final video we'll put it all together and integrate Soroban Identity into a real app, with wallets, backend verification and a path to mainnet.
