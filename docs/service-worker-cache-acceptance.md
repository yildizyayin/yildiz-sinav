# Service worker cache recovery — 2026-10-07

The previous asset handler cached every network response, including missing chunks. Reloading after a 404 could repeatedly return that cached error. Navigation failures could also overwrite the previously valid offline shell.

The handler now caches successful responses only. Script requests also require a JavaScript MIME type, so a 200 HTML fallback is not stored as executable code. Invalid existing asset entries are removed before refetching. Valid cached scripts remain available offline. Non-successful navigation responses reach the caller without replacing the shell; a network failure uses a successful cached shell or returns an explicit network error when none exists.

Writes use `event.waitUntil` and catch cache write failures, preserving the network response. The initial fetch handler also extends its lifetime synchronously, before the later asynchronous write registers another wait. APIs, non-GET requests and foreign origins are not intercepted.

Ten tests execute the actual public/service-worker.js inside Node VM, with real Request-like metadata, URL and Response objects and fake CacheStorage/network/event implementations. They cover 404 then recovery, existing cached errors, HTML posing as scripts, valid offline scripts, shell preservation on 503, offline shell/missing-shell behavior, cache write failure, API exclusion, method exclusion and origin exclusion. They do not validate browser registration, activation, actual worker suspension timing, cache eviction, browser navigation or Cloudflare deployment. The current cache namespace is retained so invalid older entries can be repaired as encountered.

References: https://developer.mozilla.org/en-US/docs/Web/API/Cache/put and https://developer.mozilla.org/en-US/docs/Web/API/ExtendableEvent/waitUntil
