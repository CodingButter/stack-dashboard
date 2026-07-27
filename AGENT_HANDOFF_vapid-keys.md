# Handoff — VAPID keys for Web Push

Web Push (segments 2–3 of the notifications feature) signs push messages with a
**VAPID keypair**. The keypair is generated **once per deployment** and must be
present before either the web server or the poller tries to send a push.

## Generate (one-time, deploy host)

```bash
node scripts/generate-vapid-keys.mjs
```

It prints a **public key** and a **private key**. The keypair is stable — do
**not** regenerate it on redeploy. Regenerating invalidates every existing push
subscription (browsers would have to re-subscribe).

## Where each key goes

| Key         | Location                                              | Why |
| ----------- | ----------------------------------------------------- | --- |
| Public key  | env var `VAPID_PUBLIC_KEY` on the **web** service      | The browser needs it as `applicationServerKey` when it calls `pushManager.subscribe()`. Safe to expose to clients. |
| Private key | encrypted settings vault, key `webpush.vapidPrivateKey` (`encrypted: true`) | The **poller** (and the web-side test-push route) read it via `loadServiceConfig("webpush")` to sign pushes. Secret — never commit, never log. |

### Set the public key

Add to the web service environment (e.g. `deploy/stackdash-web.service` or the
env file it reads):

```
VAPID_PUBLIC_KEY=<public key from the script>
```

### Set the private key (encrypted vault)

Run the one-off seed script — it upserts an encrypted `settings` row keyed
`webpush.vapidPrivateKey` via `encryptSecret` from `@/lib/crypto`:

```bash
VAPID_PRIVATE_KEY='<private key from the script>' pnpm exec tsx scripts/seed-vapid.ts
```

The key comes only from the env var; it is never hardcoded or committed.

## After setting keys

Restart both services so they pick up the env var / vault row:

```bash
systemctl --user restart stackdash-web.service
systemctl --user restart stackdash-poller.service
```

## Deploy note

`redeploy.sh` does **not** generate or seed VAPID keys — this is a manual
one-time step. Do it after Segment 2 is deployed and before testing push.
