# Subtree Instructions — packages/observability/

> These rules apply only within `packages/observability/`. They extend the root `CLAUDE.md`.

## Purpose of this subtree

Structured logging (pino) and OpenTelemetry trace initialization for all services. Services call the factory once at startup and pass the logger instance through their dependency graph.

---

## Invariants (must not be broken)

- All logging in service code must go through a logger created by `createLogger(serviceName)`. Never use `console.log`, `console.error`, or `new Logger()` directly in service code.
- Each service creates exactly one root logger via `createLogger('service-name')` at startup. Child loggers for sub-components are created with `logger.child({ component: 'name' })`.
- `initTracer(serviceName)` is a no-op if `OTEL_EXPORTER_OTLP_ENDPOINT` is not set — it is safe to call unconditionally at startup. Tracing is opt-in via environment configuration.
- Do not import `pino` or `@opentelemetry/*` packages directly in service code — import through this package.

---

## Library / tooling rules

- Use: `pino` for logging; `pino-pretty` for development output (transport target, not a direct runtime dependency in production).
- Use: `@opentelemetry/sdk-node`, `@opentelemetry/exporter-trace-otlp-http`, `@opentelemetry/resources`, `@opentelemetry/semantic-conventions` for tracing.
- Do not use: `winston`, `bunyan`, or any other logging library.

---

## Source of truth

- `src/logger.ts` — `createLogger(service)` factory and the `Logger` type alias.
- `src/tracer.ts` — `initTracer(serviceName)`, `shutdownTracer()`, and the span helpers `withSpan(name, fn, attrs?)`, `setSpanAttributes(attrs)`, plus `isLangSmithTracingEnabled()`.
- `LOG_LEVEL` env var — controls pino log level (default: `info`).
- `OTEL_EXPORTER_OTLP_ENDPOINT` env var — OTLP collector URL; if absent, tracing is disabled.
- `NODE_ENV` env var — controls output format: `production` uses JSON, anything else activates `pino-pretty`.

---

## Key patterns to follow

- Wrap unit-of-work boundaries (e.g. LangGraph nodes) with `withSpan('name', fn, attrs)`. It is transparent (returns the fn's value, re-throws its error) and a no-op when no OTEL SDK is active, so it is safe to apply unconditionally. Use `setSpanAttributes()` to attach values discovered mid-run (token usage, model). Never import `@opentelemetry/api` directly in service code — use these helpers.
- In development (`NODE_ENV !== 'production'`): `pino-pretty` transport is activated automatically, producing colorized human-readable output.
- In production: plain JSON output with structured fields. Log aggregators (e.g., Datadog, Loki) ingest this format.
- The `Logger` type exported from this package is `ReturnType<typeof createLogger>` — use it for typing logger parameters in service constructors and functions.
- Call `shutdownTracer()` in graceful shutdown handlers if you call `initTracer()` at startup.

---

## Anti-patterns to avoid

- Do not create logger instances inside hot-path functions (per-request, per-message). Create once at module/service initialization and reuse.
- Do not log sensitive data (tokens, passwords, PII) at any log level.
- Do not call `initTracer()` multiple times in the same process — the SDK instance is module-level and calling it again is a no-op but wasteful.

---

## Key Decisions

- [ADR-017 — Observability stack](../../docs/architecture/ADRs/packages/observability/ADR-017-observability-stack.md) (pino + OpenTelemetry)
