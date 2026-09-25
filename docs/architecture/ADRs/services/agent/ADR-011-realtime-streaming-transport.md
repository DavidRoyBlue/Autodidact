# ADR-011: Real-time streaming transport

## Status

Accepted
Date: 2026-05-10

## Context

The module-chat experience streams LLM tokens from the agent service to
the mobile client as they're generated. Without streaming, the user waits
several seconds staring at a "thinking" spinner before seeing any text;
with streaming, words appear progressively and the experience feels
responsive.

The token flow crosses two hops:

```
Mobile App ──SSE──> services/api ──SSE──> services/agent ──> LLM
```

The API does not buffer; it forwards events from the agent's stream
directly to the mobile client's connection. The same transport choice
covers both hops.

The protocol must also carry **non-token events**: a `module_complete`
event when the LLM signals end-of-module via the `[MODULE_COMPLETE:score=N]`
marker, a `complete` event at end-of-stream, and an `error` event when
something fails mid-stream.

## Non-goals

- Specific event schema (field names, error codes) — owned by `services/agent/src/routes/module-chat.ts` and documented in `services/agent/CLAUDE.md`.
- Reconnection logic on the client — owned by `apps/mobile`.
- The orchestration framework that produces the tokens — that's [ADR-006](./ADR-006-ai-orchestration-framework.md).
- Auth on the client → API hop — that's [ADR-020](../../cross-cutting/ADR-020-authentication-strategy.md).

## Decision Drivers

- **One-way streaming** — server pushes tokens to client; the client doesn't need to send anything back during the stream. A bidirectional protocol would be overkill.
- **Mobile compatibility** — React Native is the only client. Whatever transport we pick must have a robust RN library.
- **HTTP-friendly** — must work through normal HTTPS load balancers and Cloud Run without special configuration.
- **Easy server-side authoring** — Fastify ([ADR-005](./ADR-005-ai-agent-server-framework.md)) and NestJS ([ADR-004](../api/ADR-004-rest-api-framework.md)) both have to forward streams without buffering.
- **Backpressure / cancellation** — when the client disconnects (user navigates away mid-stream), the agent should stop generating to avoid wasted LLM tokens.
- **Reconnection / resumability** — nice-to-have. Mobile networks drop; if the stream can resume from where it left off, UX wins. If not, we restart.
- **Standard tooling** — debuggable with normal browser/curl tools.

## Options Considered

### Option A: Server-Sent Events (SSE) (current)
**What it is:** Standard HTTP-based one-way push. Server holds a `Content-Type: text/event-stream` connection open and emits `event:` / `data:` blocks separated by blank lines. Native browser support; many libraries on RN.

**Pros**
- One-way fit is exact: server pushes events; client listens. No protocol surface we don't use.
- Works through any HTTP infrastructure: Cloud Run, NGINX, load balancers, mobile carriers' networks. No WebSocket-specific config.
- Trivial to author on the server: `reply.raw.setHeader('Content-Type', 'text/event-stream'); reply.raw.write('data: ...\n\n')`.
- `EventSource` exists natively in browsers; for React Native we use `@microsoft/fetch-event-source` (mature, allows POST request with headers — important for our auth pattern).
- Auto-reconnect is built into the protocol (`Last-Event-ID` header) when libraries support it.
- Multiple event types are first-class (`event:` field), which we use for `token`, `module_complete`, `complete`, `error`.
- Debuggable with `curl` — the wire format is human-readable.

**Cons**
- One-way only. If we ever need client → server during a stream (e.g., "regenerate" or "stop"), we're sending a separate HTTP request. For our current flow that's fine; for richer chat patterns it's a constraint.
- Some intermediate proxies buffer chunked HTTP responses; we explicitly disable buffering with headers (`X-Accel-Buffering: no`) and Cloud Run plays nicely.
- Native browsers only allow GET with `EventSource`. For POST we use a fetch-based library; works but a small ergonomic step.
- Cancellation requires client to close the connection; backpressure handling on the server side is "client closed → cleanup in `finally`" rather than something the protocol enforces.

### Option B: WebSocket
**What it is:** Full-duplex bidirectional connection upgraded from HTTP. Long-running socket; either side can send messages.

**Pros**
- Bidirectional — would support "stop generation" or "regenerate from here" as client → server messages without a separate HTTP round trip.
- Lower per-message overhead than HTTP after the initial handshake.
- Mature client/server libraries.

**Cons**
- We don't need bidirectional. Paying the WebSocket cost (separate library, separate auth wiring, sticky-session considerations on Cloud Run, more complex error model) for zero benefit.
- Cloud Run supports WebSockets but with caveats: connection timeout, instance affinity. SSE is the more native fit for an HTTP-first runtime.
- Authentication is awkward: WebSocket protocols don't natively support headers (you authenticate via subprotocol or a query parameter), unlike SSE which uses a normal HTTP request.
- Two-hop architecture is harder: API service would have to maintain a WS connection to client *and* to agent — message-passing complexity grows.

### Option C: gRPC streaming
**What it is:** HTTP/2-based RPC with first-class streaming (server-streaming, client-streaming, bidirectional). Strongly typed via Protocol Buffers.

**Pros**
- Strongly typed contracts; protobuf schemas are the wire-format.
- Native streaming primitives in language SDKs.
- Excellent for service-to-service communication.

**Cons**
- gRPC over the public internet to a mobile client is unusual. We'd need `grpc-web` (browser) or a React Native shim, both of which have constraints and sharp edges.
- HTTP/2 requirements (specifically gRPC's reliance on HTTP/2 trailer frames) make it incompatible with some HTTP intermediaries that mobile traffic crosses.
- Infrastructure tax: protobuf code generation in the build pipeline, gRPC servers in both api and agent, separate health-check protocols.
- Not the "just curl it" debug experience.
- Dramatically heavier than SSE for what we actually need.

### Option D: HTTP polling (long polling or chunked transfer encoding without SSE conventions)
**What it is:** Client polls a status endpoint repeatedly, or receives a single long response with chunked encoding but no SSE event framing.

**Pros**
- Maximum compatibility — every HTTP client supports it.
- No special headers, no library required.

**Cons**
- Polling is wasteful and adds latency (each poll adds a round-trip).
- Long-polling with chunked encoding loses event-type discrimination (no `event: token` vs `event: error`); we'd reinvent SSE's framing.
- For real-time token streaming, polling is the wrong tool.

### Option E: Vercel AI SDK stream protocol
**What it is:** The Vercel AI SDK's data-stream protocol on top of HTTP — used in Next.js / `useChat` / `useCompletion` patterns. Sends typed message-part deltas.

**Pros**
- Best-in-class DX on the Vercel/Next.js side; `useChat` "just works."
- Typed stream events (text deltas, tool calls, usage info).
- Handles many edge cases (back-pressure, reconnection) inside the library.

**Cons**
- Tightly coupled to `useChat` / `useCompletion` ergonomics — value lights up when you use the Vercel AI SDK end-to-end ([ADR-006](./ADR-006-ai-orchestration-framework.md) decided not to). Adopting just the wire protocol without the SDK makes us reimplement the framing ourselves.
- React Native client integration is less established than SSE's.
- Couples our wire protocol to a vendor's roadmap.
- The current Vercel AI SDK stream protocol uses SSE as the underlying transport for many of its event types — we'd be picking SSE indirectly.

## Decision

**We use Server-Sent Events (SSE) for both hops (agent → API → mobile).**

## Rationale

Lining up the drivers:

- **One-way streaming (#1)**: SSE is a one-way protocol by design. Exact fit. WebSocket and gRPC streaming are bidirectional — we'd pay for protocol surface we don't use.
- **Mobile compatibility (#2)**: SSE has `@microsoft/fetch-event-source` for RN — battle-tested, supports POST requests with headers (we need this for auth). WebSocket has libraries on RN; gRPC-Web is the rough corner.
- **HTTP-friendly (#3)**: SSE is plain HTTP. No special infrastructure. WebSocket needs upgrade handling and sticky sessions; gRPC needs HTTP/2 + trailer frames; both are workable but more configuration.
- **Server authoring (#4)**: SSE is `setHeader + write + end`. Fastify's raw response API handles it; NestJS supports it via `@Sse()` or by going to the underlying response. WebSocket is heavier on both frameworks.
- **Backpressure / cancellation (#5)**: SSE handles "client disconnected" via the standard `request.aborted` event; our handlers wire that to LangGraph's abort signal so the LLM call stops. This pattern works equally for any HTTP-based streaming.
- **Reconnection (#6)**: SSE's built-in `Last-Event-ID` is a nice-to-have we don't currently exploit (each session is a fresh stream); WebSocket would require us to author reconnect ourselves. Slight edge to SSE.
- **Standard tooling (#7)**: SSE is `curl`-debuggable. WebSocket needs a WebSocket-aware tool. gRPC needs `grpcurl`. SSE wins ergonomically.

What we are sacrificing by picking SSE:

- Bidirectional control during a stream (cancel/regenerate). Worth it; we don't currently need it, and a separate HTTP request is fine.
- Protobuf-typed contracts. We use Zod schemas at the message level; the type safety lives at our application layer rather than the wire layer.

No reconsideration flag is raised. SSE is the first-principles choice for
one-way token streaming over HTTP to a React Native client.

## Consequences

### Positive
- The same protocol on both hops keeps the API's pass-through trivially simple (read SSE event; write SSE event).
- `curl http://localhost:3001/module-chat/stream` shows the live event stream — debug-friendly.
- React Native client integration via `@microsoft/fetch-event-source` is battle-tested in production.
- Multiple event types (`token`, `module_complete`, `complete`, `error`) ride on SSE's native `event:` field.
- Cloud Run supports SSE without special configuration when buffering is disabled.

### Negative
- One-way; a future "stop generation" feature requires a separate HTTP request rather than reusing the open stream.
- Some intermediaries (older corporate proxies, certain CDN configurations) buffer HTTP responses; we explicitly send `X-Accel-Buffering: no` and similar headers to mitigate, but field reports of buffering issues are not impossible.
- No native browser POST support — RN client uses a fetch-based library rather than the built-in `EventSource`.

### Follow-up decisions
- Specific event schema, error code conventions — owned by `services/agent/src/routes/module-chat.ts` and `services/agent/CLAUDE.md`.
- Reconnection / resume behavior on the mobile client — owned by `apps/mobile/CLAUDE.md`.
- Reconsider this ADR if: features emerge that require bidirectional streaming during a turn (real-time interrupt, tool-use confirmation), or if multi-modal streaming (audio chunks, image partials) demands a more efficient wire format than text-event-stream.

## Update (2026-09-25)

[ADR-031](../../cross-cutting/ADR-031-module-teacher-on-agent-platform.md)
moved the teacher to AgentPlatform, which returns a turn whole. The
transport is now one hop, API → mobile, still SSE with the same events: the
reply arrives as a single `token` event, `module_complete` carries the
teacher's structured `score` (no marker), then `complete`. Token streaming
returns when the platform streams runs.
