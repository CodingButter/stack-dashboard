#!/usr/bin/env node
// One-off deploy-time tool. Generates a VAPID keypair for Web Push.
//
// Run ONCE per deployment. Regenerating invalidates every existing push
// subscription, so do not run this on every deploy.
//
//   node scripts/generate-vapid-keys.mjs
//
// Then, on the target host:
//   - Put the PUBLIC key in the web service env as VAPID_PUBLIC_KEY
//     (the browser needs it as the applicationServerKey when subscribing).
//   - Put the PRIVATE key in the encrypted settings vault under
//     `webpush.vapidPrivateKey` (encrypted: true). The poller reads it at
//     runtime via loadServiceConfig("webpush") to sign pushes.
//
// The private key is a secret: never commit it, never print it to logs.

import webpush from "web-push";

const { publicKey, privateKey } = webpush.generateVAPIDKeys();

console.log("VAPID keypair generated.\n");
console.log("VAPID_PUBLIC_KEY (env var, safe to expose to the browser):");
console.log(publicKey);
console.log("");
console.log("webpush.vapidPrivateKey (encrypted settings vault, SECRET):");
console.log(privateKey);
console.log("");
console.log("Store the public key in VAPID_PUBLIC_KEY and the private key in");
console.log("the encrypted vault, then restart the web and poller services.");
