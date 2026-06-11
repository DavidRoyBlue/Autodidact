# @autodidact/types

## Purpose

Shared TypeScript type definitions for the Autodidact domain model. Pure compile-time types — no runtime code, no validation logic. Types here describe the shape of data flowing between services and packages.

The distinction from `@autodidact/schemas`: types here are for static structural definitions and internal DTOs. If a type needs runtime validation (HTTP boundaries, LLM output parsing), it belongs in `@autodidact/schemas` as a Zod schema with a derived `z.infer<>` type.

## Consumers

| Consumer | Usage |
|----------|-------|
| `packages/db` | `CourseBlueprint`, `ContentSection` in schema column type annotations |
| `packages/schemas` | `DifficultyLevel` imported for `DifficultyLevelSchema` enum |
| `packages/providers` | `AuthUser`, `JobStatus` in interface definitions |
| `packages/prompts` | `ModuleBlueprint` in `buildModuleSystemPrompt` signature |
| `services/api` | `UserProfile`, `AuthUser`, `UserProgress`, `ChatSession`, job data types |
| `services/agent` | `CourseBlueprint`, `ModuleBlueprint`, `StreamChunk`, job data types |
| `services/worker` | `CourseGenerationJobData`, `EmbeddingJobData` |

## Public API

```typescript
import type {
  // Course domain
  CourseStatus,             // 'pending' | 'generating' | 'ready' | 'failed'
  ModuleStatus,             // 'locked' | 'available' | 'in_progress' | 'completed'
  DifficultyLevel,          // 'beginner' | 'intermediate' | 'advanced'
  JobStatus,                // 'pending' | 'active' | 'completed' | 'failed' | 'delayed'
  ContentSection,           // { title: string; points: string[] }
  ModuleBlueprint,          // Full module definition from LLM output
  CourseBlueprint,          // Full course definition from LLM output

  // Chat domain
  ChatRole,                 // 'user' | 'assistant' | 'system'
  ChatMessage,              // { id, role, content, createdAt }
  StreamChunk,              // SSE stream payload union
  ChatSession,              // Full chat session with messages

  // User domain
  UserProfile,              // Public user profile
  AuthUser,                 // Authenticated user identity (id, supabaseId, email)
  ModuleProgressItem,       // Per-module progress for a user
  UserProgress,             // Enrollment + all module progress for a user

  // Job queue payloads
  CourseGenerationJobData,  // Task payload for course generation
  EmbeddingJobData,         // Task payload for embedding generation
} from '@autodidact/types';
```

## Internal Structure

```
packages/types/src/
├── course.ts   # Status unions, ContentSection, ModuleBlueprint, CourseBlueprint
├── chat.ts     # ChatRole, ChatMessage, StreamChunk, ChatSession
├── user.ts     # UserProfile, AuthUser, ModuleProgressItem, UserProgress
├── jobs.ts     # CourseGenerationJobData, EmbeddingJobData
└── index.ts    # Re-exports all of the above
```

## Usage Example

```typescript
import type { CourseBlueprint, ModuleStatus, StreamChunk } from '@autodidact/types';

function processBlueprint(blueprint: CourseBlueprint): void {
  blueprint.modules.forEach((m) => {
    console.log(`Module ${m.position}: ${m.title} (${m.estimatedMinutes}min)`);
  });
}

function createChunk(token: string): StreamChunk {
  return { type: 'token', content: token };
}
```

## Gotchas

- `JobStatus` includes `'delayed'` (a legacy queue state, unused since the Cloud Tasks migration) in addition to the standard `'pending' | 'active' | 'completed' | 'failed'` states. Do not rely on `'delayed'` in business logic.
- `StreamChunk.type: 'module_complete'` carries `score` and `feedback` fields — these are only populated on the `module_complete` event, not on `token` chunks.
- Do not add Zod schemas or `z.infer<>` types to this package. They belong in `@autodidact/schemas`.
