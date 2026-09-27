---
title: Introduction to Soroban Identity
slug: 01-introduction
duration: 05:00
---

# 01 · Introduction to Soroban Identity

<!-- video:watch -->
*Video coming soon.*
<!-- /video:watch -->


**Audience:** developers and product people new to the project.
**Goal:** understand what Soroban Identity is, the problem it solves, and how the pieces fit, before touching any code.
**SDK version:** 0.1.0
**Setup before recording:** frontend running on testnet (`npm run dev --workspace=frontend`), Freighter installed with a funded testnet account that already has a DID, [`docs/architecture.md`](../../architecture.md) open in the editor.

## [00:00] Cold open

**On screen:** The dApp's Identity tab. Paste a Stellar address, click *Resolve*, and the DID document appears.

> This is a decentralized identity, living on the Stellar network.
> This series is recorded against version 0.1.0 of the Soroban Identity SDK.
> Nobody issued it to this wallet, no company stores it, and any app on Stellar can read it in a single call.
> In the next five minutes you'll see what Soroban Identity is, why it exists, and how it's put together.

## [00:25] The problem

**On screen:** Title card, then three bullet points appear one by one: *No persistent identity* · *Fragmented reputation* · *Hard compliance*.

> Web3 has a strange gap. Your wallet can hold millions, but it can't say anything about who you are.
> Every app starts from zero. Reputation you earn in one marketplace doesn't follow you to the next.
> And when an app needs compliance, like KYC, the usual answer is to collect your documents and keep them on a server, which is exactly the kind of central honeypot blockchains were supposed to avoid.

## [01:05] What Soroban Identity is

**On screen:** The README's "Core Features" section. Highlight each heading as it is mentioned.

> Soroban Identity is an identity layer for Stellar, built as Soroban smart contracts.
> It gives every wallet a decentralized identifier, a DID, in the form did colon stellar colon, followed by the wallet address.
> Trusted issuers can attach verifiable credentials to that DID: a KYC badge, a proof of membership, an achievement.
> Apps then verify those credentials on-chain, without ever seeing the underlying personal data.
> And a reputation layer lets trusted reporters score on-chain activity, with anti-sybil checks built in.

## [01:55] The three contracts

**On screen:** `docs/architecture.md`, the layer diagram. Zoom on each contract box.

> Under the hood there are three contracts.
> The identity registry stores DID documents: who controls them, their metadata, and whether they're active.
> The credential manager keeps a list of trusted issuers, and handles issuing, revoking and verifying credentials.
> And the reputation contract aggregates scores from registered reporters, and answers one very useful question: does this address pass a sybil check?
> Each contract does one job, and they can be used independently.

## [02:45] How apps use it

**On screen:** README "TypeScript SDK" snippet. Highlight `IdentityClient`, `CredentialClient`, `ReputationClient`. Briefly show the `server/` folder.

> Most apps won't call the contracts directly. The TypeScript SDK wraps each one in a client.
> Point it at testnet or mainnet, give it the three contract IDs, and you can resolve a DID, verify a credential, or run a sybil check in a line of code.
> There's also a reference React app, the one you saw at the start, that works with Freighter and other Stellar wallets, and an API server for backends that prefer plain HTTP.

## [03:25] A credential in one picture

**On screen:** README "Credential Flow" diagram: Issuer → Subject → Verifier.

> Here's the whole idea in one picture.
> An issuer, say a KYC provider, issues a credential to a subject's address.
> The subject shares only the credential ID with a verifier.
> The verifier asks the contract: is this credential valid, not revoked, not expired?
> The answer is yes or no. The verifier never needs the passport scan.

## [04:05] Use cases

**On screen:** README "Use Cases" list.

> That pattern covers a lot of ground: KYC-gated DeFi, reputation for marketplaces, DAO voting eligibility, gated communities, and protecting airdrops from sybil farms.

## [04:30] What's next

**On screen:** End card listing the rest of the series with durations.

> In the next video, the quick start, we'll deploy all three contracts to testnet and run the app locally in about ten minutes.
> After that we go deep on DIDs, the full credential lifecycle, and finally integrating Soroban Identity into your own app.
> See you in the quick start.
