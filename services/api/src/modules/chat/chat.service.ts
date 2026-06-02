import { Injectable, NotFoundException } from '@nestjs/common';

import { Observable, Subject } from 'rxjs';
import type { MessageEvent } from '@nestjs/common';
import { getDb, chatSessions, courses, modules, moduleProgress, eq, and } from '@autodidact/db';
import { ProgressService } from '../progress/progress.service.js';
import type { ChatMessage } from '@autodidact/types';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class ChatService {
  constructor(private readonly progressService: ProgressService) {}

  async createSession(userId: string, moduleId: string, _courseId: string) {
    const db = getDb();
    const [session] = await db
      .insert(chatSessions)
      .values({ userId, moduleId, threadId: uuidv4(), messages: [] })
      .returning();
    return session;
  }

  async getSession(sessionId: string) {
    const db = getDb();
    const [session] = await db
      .select()
      .from(chatSessions)
      .where(eq(chatSessions.id, sessionId))
      .limit(1);
    if (!session) throw new NotFoundException('Session not found');
    return session;
  }

  streamMessage(
    sessionId: string,
    userId: string,
    content: string,
    agentServiceUrl: string,
  ): Observable<MessageEvent> {
    const subject = new Subject<MessageEvent>();

    void (async () => {
      const db = getDb();
      const session = await this.getSession(sessionId);

      const mod = await db
        .select()
        .from(modules)
        .where(eq(modules.id, session.moduleId))
        .limit(1);

      if (!mod[0]) {
        subject.next({ data: JSON.stringify({ type: 'error', error: 'Module not found' }) });
        subject.complete();
        return;
      }

      // Append user message to session
      const userMsg: ChatMessage = {
        id: uuidv4(),
        role: 'user',
        content,
        createdAt: new Date().toISOString(),
      };

      await db
        .update(chatSessions)
        .set({
          messages: [...session.messages, userMsg],
          updatedAt: new Date(),
        })
        .where(eq(chatSessions.id, sessionId));

      // Build the course-progress context the agent's module-chat route requires.
      const courseId = mod[0].courseId;
      const [course] = await db
        .select({ title: courses.title })
        .from(courses)
        .where(eq(courses.id, courseId))
        .limit(1);
      const allModules = await db
        .select({ id: modules.id })
        .from(modules)
        .where(eq(modules.courseId, courseId));
      const completedModules = await db
        .select({ id: moduleProgress.moduleId })
        .from(moduleProgress)
        .where(
          and(
            eq(moduleProgress.userId, userId),
            eq(moduleProgress.courseId, courseId),
            eq(moduleProgress.status, 'completed'),
          ),
        );
      const courseProgress = {
        courseTitle: course?.title ?? '',
        completedModuleCount: completedModules.length,
        totalModuleCount: allModules.length,
      };

      // Proxy SSE stream from agent service
      const res = await fetch(`${agentServiceUrl}/module-chat/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: session.threadId,
          userId,
          message: content,
          courseProgress,
          isFirstMessage: session.messages.length === 0,
          moduleBlueprint: mod[0].contentOutline
            ? {
                position: mod[0].position,
                title: mod[0].title,
                description: mod[0].description,
                objectives: mod[0].objectives as string[],
                contentOutline: mod[0].contentOutline as unknown as Array<{ title: string; points: string[] }>,
                estimatedMinutes: mod[0].estimatedMinutes,
              }
            : {},
        }),
      });

      if (!res.ok || !res.body) {
        subject.next({ data: JSON.stringify({ type: 'error', error: 'Agent unavailable' }) });
        subject.complete();
        return;
      }

      let assistantContent = '';
      let completionScore: number | null = null;

      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const text = decoder.decode(value, { stream: true });
          const lines = text.split('\n');

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const jsonStr = line.slice(6).trim();
            if (!jsonStr) continue;

            try {
              const event = JSON.parse(jsonStr) as { type: string; content?: string; score?: number; error?: string };
              subject.next({ data: jsonStr });

              if (event.type === 'token' && event.content) {
                assistantContent += event.content;
              } else if (event.type === 'module_complete' || event.type === 'complete') {
                // The agent carries the score on `module_complete`; `complete` is
                // the terminator and may omit it. Keep the last score we saw.
                completionScore = event.score ?? completionScore;
              }
            } catch {
              // Ignore malformed SSE lines
            }
          }
        }
      } finally {
        reader.releaseLock();
      }

      // Persist assistant message
      if (assistantContent) {
        const updatedSession = await this.getSession(sessionId);
        const assistantMsg: ChatMessage = {
          id: uuidv4(),
          role: 'assistant',
          content: assistantContent,
          createdAt: new Date().toISOString(),
        };
        await db
          .update(chatSessions)
          .set({
            messages: [...updatedSession.messages, assistantMsg],
            updatedAt: new Date(),
          })
          .where(eq(chatSessions.id, sessionId));
      }

      // Handle module completion
      if (completionScore !== null && completionScore >= 60) {
        const enrollment = await db
          .select()
          .from(modules)
          .where(eq(modules.id, session.moduleId))
          .limit(1);

        if (enrollment[0]) {
          await this.progressService.completeModule(
            userId,
            session.moduleId,
            enrollment[0].courseId,
            completionScore,
          );
        }
      }

      subject.complete();
    })().catch((err: unknown) => {
      subject.next({ data: JSON.stringify({ type: 'error', error: String(err) }) });
      subject.complete();
    });

    return subject.asObservable();
  }
}
