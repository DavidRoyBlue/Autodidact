# Data Flow

## REST — React Query + apiFetch

All REST calls go through `src/api/client.ts:apiFetch`, which:

- Reads the base URL from `app.json` `extra.apiBaseUrl` (falls back to `http://localhost:3000/v1`).
- Reads the JWT from `auth.store.getState().accessToken` (non-reactive, safe to call outside React).
- Attaches `Authorization: Bearer <token>` on every request.
- On a 401 response: attempts a Supabase session refresh (`supabase.auth.refreshSession()`). If successful, calls `setSession(newAccessToken, newRefreshToken)` and retries the original request transparently. If the refresh fails, calls `clearSession()` — the auth guard in `_layout.tsx` then redirects to sign-in.

React Query hooks live in `src/api/`:

| File | Hooks |
|------|-------|
| `courses.ts` | `useUserCourses` (list with progress and next module; polls while a course builds), `useCourse`, `useCreateCourse`, `useRetryCourse` |
| `progress.ts` | `useProgress` |
| `chat.ts` | `useStartChatSession` (opens or resumes the learner's session on a module) |

Global defaults: `staleTime: 30_000`, `retry: 1`.

## Streaming — SSE chat

`src/hooks/useSSE.ts` posts the learner's turn and reads the API's SSE body whole once the server closes it (React Native's fetch has no streaming body), then replays the events in order. The teacher's reply arrives as one `token`.

```
useSSE.send(content)
  → useChatStore.addUserMessage()         # optimistic: add user bubble, set isStreaming
  → POST /chat/sessions/:id/stream
      { type: 'token' }                   → useChatStore.appendStreamToken()
      { type: 'module_complete' }         → invalidate ['progress', courseId] and ['courses']
      { type: 'error' }                   → error toast
  → useChatStore.finalizeStreamMessage()  # always, error or not
```

While `isStreaming` is true and no text has arrived, the chat screen shows `TypingIndicator`. Module completion shows as a card in the chat, driven by the refreshed progress, not by the event.

## Course generation

`POST /courses` enrolls the creator at once, so a course being generated is on `GET /courses` with status `pending`/`generating`; the Worker opens its first module for every enrolled learner when the modules land. `useUserCourses` polls every 5 s while any course is building, and Home's `CourseCard` shows the state. Nothing on the phone has to stay open for a course to finish.
