# Module: Courses

## Responsibility

Manages the full course lifecycle: discovery via semantic similarity, creation via background job, enrollment, and status polling. This is the most complex module in the API service.

## Files

| File | Description |
|------|-------------|
| `courses.controller.ts` | REST endpoints for course operations |
| `courses.service.ts` | Core business logic: similarity search, enqueue, enroll |
| `courses.module.ts` | NestJS module wiring, injects `AgentClient` and `IQueueProvider` |

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/courses` | Create or reuse a course (main entry point) |
| `GET` | `/courses` | List enrolled courses for authenticated user |
| `GET` | `/courses/:id` | Course detail with module list |
| `POST` | `/courses/:id/enroll` | Enroll in an existing course |
| `GET` | `/courses/status/:courseId` | Poll generation status (DB-backed) |

## createOrReuse Algorithm

This is the central piece of logic. Every `POST /courses` request goes through it:

```
1. agentClient.generateEmbedding(dto.topic)
     → float[] (1536 dimensions)

2. pgvector similarity query:
     SELECT id, title
     FROM courses
     WHERE status = 'ready'
       AND is_public = TRUE
       AND topic_embedding IS NOT NULL
       AND 1 - (topic_embedding <=> $vector::vector) > 0.92
     ORDER BY similarity DESC
     LIMIT 1

3a. Row found (similarity > 0.92):
       → enrollUser(userId, existingCourseId)
       → return { courseId, status: 'ready', reused: true }

3b. No row (new topic):
       → INSERT courses { topic, slug, title: topic, status: 'pending', ... }
       → queueProvider.enqueue(COURSE_GENERATION, { courseId, topic, ... })
       → return { courseId, status: 'pending', reused: false }
```

**Embedding call happens on every request**, even for reused courses. This is necessary because we need the vector to run the similarity search.

## Enrollment Logic

`enrollUser(userId, courseId)` is idempotent (safe to call multiple times):

```
1. INSERT enrollments ON CONFLICT (userId, courseId) DO UPDATE SET lastAccessedAt = NOW()
2. For each module in course (ordered by position):
     INSERT module_progress { userId, moduleId, courseId,
                              status: position === 0 ? 'available' : 'locked' }
     ON CONFLICT DO NOTHING
```

Module 0 starts `available`. All other modules start `locked`. Progress rows are only inserted if they don't already exist, so re-enrollment does not reset progress.

## Slug Generation

Course slugs are generated from the topic at creation time:
```typescript
slug = topic.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
// "Introduction to TypeScript" → "introduction-to-typescript"
```

Slugs are not unique-constrained at the database level. If two courses have the same topic (possible if similarity < 0.92), they will have the same slug.

## Generation Status Polling

`GET /courses/status/:courseId` reads `courses.status` from the database (the Worker owns the `generating`/`ready`/`failed` transitions) and maps it to the polling vocabulary: `pending→pending`, `generating→active`, `ready→completed`, `failed→failed`. The mobile app polls this endpoint every 2 seconds (via TanStack Query `refetchInterval`) until status is `completed` or `failed`, then navigates to the course detail screen.
