---
name: stackdash-data-source-classification
description: Classify every StackDash field onto its transport axis (UDP 2Hz push, tiered HTTP poll, or a new/uncaptured source) with evidence, respecting the 1280-byte MTU budget. Use to build the data-contract, mapping each field to a producer and update mechanism.
---

# stackdash-data-source-classification

Assign every field a transport kind + producer of record. This is the heart of the
data-contract and the most review-scrutinized step.

## The fixed 3-axis rule (verbatim)

1. **UDP 2Hz push** — cheap continuous values in Wren's blaster (governor, vitals, stream
   counts/bandwidth, worker/queue depth). Hard constraint: fire-and-forget over WireGuard,
   **1280-byte MTU, envelope already gzipped**. Every new live field competes for that
   budget; a design wanting many new live fields must fall back to HTTP.
2. **HTTP poll, tiered cadence** — fast 5s (downloads, plex sessions),
   **medium 10–15s (Tdarr nodes, *arr queues)**, slow 300s (plex-recent). An `http-poll`
   field MUST declare its cadence tier.
3. **New source / not-yet-captured** — classify as `unknown`, flag loudly, and sequence
   poller/endpoint/schema work BEFORE the UI. A required field left `unknown` is a hard block.

## Transport-kind enum

`udp-push | http-poll | database-query | event-driven | local-derived | server-derived |
static-config | unknown`.

## Procedure

1. For each field, identify the producer of record — the symbol/derivation that yields the
   value, not the raw upstream number if a corrective derivation exists.
2. Choose exactly one transport kind. For `udp-push`, confirm the field fits the MTU budget;
   if it does not, fall back to `http-poll`.
3. Record `producer`, `producerRef` (path#symbol), `updateMechanism`, and cadence tier.
4. Emit a `data-contract` and validate it. Run `no-unknown-producer` and any configured
   `no-forbidden-producer` patterns.

## Rules

- Snapshots are producer truth, not `poll_state`.
- The producer of record for a corrected value is its derivation, never the raw field it
  corrects.
