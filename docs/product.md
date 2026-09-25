# Product Vision

Autodidact helps users learn any subject through structured AI-guided courses.

## Core Experience

1. User enters a topic and difficulty level
2. System finds a semantically similar existing course (pgvector similarity > 0.92) or generates a new one
3. Course is split into sequential modules, each covering one focused concept
4. User enters a module chat — the AI teacher guides them through the material
5. When the user demonstrates understanding, the module is marked complete and the next unlocks
6. Progress is saved and persists across sessions

## Teaching Model

The course structure is predefined and deterministic.
The teaching experience is adaptive and conversational.

This means:
- Modules stay strictly on their topic
- Users can ask any question within scope
- The AI explains with examples and analogies
- The AI uses Socratic questions to check understanding
- Completion is evaluated by the AI based on conversation quality

## Course Reuse

When a user requests a topic, the system generates an embedding of the topic text
and searches existing courses for a cosine similarity above 0.92. If found, the existing
course is reused and the user is enrolled instantly — no generation wait time.

## Module Unlock Flow

1. On enrollment, module 0 is unlocked (`status = available`), all others locked.
2. User completes a module (the teacher's reply carries `module_complete: true` and a `score`).
3. Module is marked completed with a score.
4. Next module in sequence is unlocked.
5. When all modules complete, enrollment is marked done.

## Goals

- Make learning structured and goal-oriented
- Make AI feel like a patient, knowledgeable teacher
- Preserve progress across sessions
- Scale course creation efficiently through caching and async generation
