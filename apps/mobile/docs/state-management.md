# State Management

Client state is managed by two Zustand stores in `src/stores/`. Server state is owned by React Query (see [data-flow.md](data-flow.md)).

## auth.store

`src/stores/auth.store.ts`

Persisted to device **SecureStore** via the Zustand `persist` middleware.

| Field | Type | Purpose |
|-------|------|---------|
| `accessToken` | `string \| null` | Supabase access JWT. Presence determines auth state. |
| `refreshToken` | `string \| null` | Supabase refresh token. Used by `apiFetch` to silently refresh expired access tokens. |
| `email` | `string \| null` | The signed-in email, from the Supabase session (`null` for guests). |

Actions:

| Action | Signature | Effect |
|--------|-----------|--------|
| `setSession` | `(accessToken, refreshToken)` | Stores both tokens (called on sign-in and on silent token refresh) |
| `setEmail` | `(email)` | Set by the root layout's `onAuthStateChange` listener |
| `clearSession` | `()` | Nulls all three fields |

The store is read in three places outside React components:

- `app/_layout.tsx` — auth guard watches `accessToken` to redirect between route groups; also calls `setSession` / `clearSession` in response to Supabase auth events.
- `src/api/client.ts` — `apiFetch` calls `getState().accessToken` to attach the auth header; calls `getState().setSession()` after a successful token refresh.
- `src/hooks/useSSE.ts` — sends through `apiFetch`, which reads `accessToken` with `getState()`.

## chat.store

`src/stores/chat.store.ts`

**In-memory only** — not persisted. Cleared when the app restarts or when `clearMessages()` is called (e.g. when leaving the chat screen).

| Field | Type | Purpose |
|-------|------|---------|
| `messages` | `ChatMessage[]` | Finalised conversation history |
| `streamingContent` | `string` | Accumulates SSE tokens during a live response |
| `isStreaming` | `boolean` | True while an SSE response is in flight |

Actions:

| Action | Effect |
|--------|--------|
| `addUserMessage(content)` | Appends a user message, sets `isStreaming: true`, clears `streamingContent` |
| `appendStreamToken(token)` | Concatenates a new token onto `streamingContent` |
| `finalizeStreamMessage()` | Moves `streamingContent` into `messages` as an assistant message, clears streaming state. No-op (just sets `isStreaming: false`) if `streamingContent` is empty. |
| `setMessages(messages)` | Replaces the entire history (used on initial load) |
| `clearMessages()` | Resets everything to empty |

## toast.store

`src/stores/toast.store.ts`

**In-memory only** — not persisted. Cleared when the app restarts.

| Field | Type | Purpose |
|-------|------|---------|
| `toasts` | `Toast[]` | Active notification queue. Each toast has `id`, `message`, `variant`. |

Actions:

| Action | Effect |
|--------|--------|
| `addToast(message, variant?)` | Appends a toast with a `uuidv4` id. Variant defaults to `'info'`. |
| `removeToast(id)` | Removes a toast by id (called automatically after 3 s by `Toast.tsx`). |

`useSSE` toasts a failed teacher turn; the New course screen toasts that a course is building or failed to start; Home toasts a failed retry.
`ToastProvider` reads `toasts` via selector and renders them as an animated overlay.

## Patterns

- **In React components:** use hooks (`useAuthStore(s => s.token)`) with selectors to avoid unnecessary re-renders.
- **Outside React (API, hooks):** use `useAuthStore.getState()` — Zustand stores expose their state synchronously without a hook.
- **Never** import `chat.store` from `auth.store` or vice versa. Cross-store reads go through `getState()` at the call site.
