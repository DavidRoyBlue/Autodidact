import { Injectable, NotFoundException } from '@nestjs/common';

import { Observable, Subject } from 'rxjs';
import type { MessageEvent } from '@nestjs/common';
import { getDb, chatSessions, courses, modules, moduleProgress, eq, and } from '@autodidact/db';
import { ProgressService } from '../progress/progress.service.js';
import { ProvisioningService } from '../provisioning/provisioning.service.js';
import { ApiAgentClient } from '../../services/agent.client.js';
import { ApiPlatformClient } from '../../services/agent-platform.client.js';
import { referenceMaterial } from './retriever.js';
import type { ChatMessage } from '@autodidact/types';
import { v4 as uuidv4 } from 'uuid';

/** A module is completed when the teacher signals completion at this mastery or better. */
const PASS_SCORE = 60;

@Injectable()
export class ChatService {
  constructor(
    private readonly progressService: ProgressService,
    private readonly provisioning: ProvisioningService,
    private readonly agentClient: ApiAgentClient,
    private readonly platform: ApiPlatformClient,
  ) {}

  async createSession(userId: string, moduleId: string, _courseId: string) {
    await this.provisioning.ensureProvisioned(userId);
    const db = getDb();
    const [session] = await db
      .insert(chatSessions)
      .values({ userId, moduleId, messages: [] })
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

  /**
   * One learner turn: the platform's course-teacher agent runs once on the
   * session's thread (ADR-031). The first turn opens the thread and carries the
   * module — course title, position, objectives, the full lesson — so the
   * platform's thread history holds it for every later turn, which carry the
   * learner's text plus any retrieved reference material. The phone keeps its
   * event contract: the reply as one `token`, `module_complete` when the
   * teacher says so, then `complete`.
   */
  streamMessage(sessionId: string, userId: string, content: string): Observable<MessageEvent> {
    const subject = new Subject<MessageEvent>();

    void (async () => {
      const db = getDb();
      const session = await this.getSession(sessionId);

      const [mod] = await db
        .select()
        .from(modules)
        .where(eq(modules.id, session.moduleId))
        .limit(1);

      if (!mod) {
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

      let threadId = session.threadId;
      let message = content;
      if (threadId === null) {
        threadId = await this.platform.createThread(`module ${mod.id}`);
        await db.update(chatSessions).set({ threadId }).where(eq(chatSessions.id, sessionId));
        message = `${await this.moduleBrief(userId, mod)}\n\nLearner: ${content}`;
      } else {
        message += await referenceMaterial(this.agentClient, mod.id, content);
      }

      const reply = await this.platform.teach(threadId, message);

      subject.next({ data: JSON.stringify({ type: 'token', content: reply.reply }) });
      if (reply.module_complete) {
        subject.next({ data: JSON.stringify({ type: 'module_complete', score: reply.score }) });
      }
      subject.next({ data: JSON.stringify({ type: 'complete' }) });

      const updatedSession = await this.getSession(sessionId);
      const assistantMsg: ChatMessage = {
        id: uuidv4(),
        role: 'assistant',
        content: reply.reply,
        createdAt: new Date().toISOString(),
      };
      await db
        .update(chatSessions)
        .set({
          messages: [...updatedSession.messages, assistantMsg],
          updatedAt: new Date(),
        })
        .where(eq(chatSessions.id, sessionId));

      if (reply.module_complete && reply.score !== null && reply.score >= PASS_SCORE) {
        await this.progressService.completeModule(userId, mod.id, mod.courseId, reply.score);
      }

      subject.complete();
    })().catch((err: unknown) => {
      subject.next({ data: JSON.stringify({ type: 'error', error: String(err) }) });
      subject.complete();
    });

    return subject.asObservable();
  }

  /** The module as the teacher's first message carries it. */
  private async moduleBrief(userId: string, mod: typeof modules.$inferSelect): Promise<string> {
    const db = getDb();
    const [course] = await db
      .select({ title: courses.title })
      .from(courses)
      .where(eq(courses.id, mod.courseId))
      .limit(1);
    const allModules = await db
      .select({ id: modules.id })
      .from(modules)
      .where(eq(modules.courseId, mod.courseId));
    const completed = await db
      .select({ id: moduleProgress.moduleId })
      .from(moduleProgress)
      .where(
        and(
          eq(moduleProgress.userId, userId),
          eq(moduleProgress.courseId, mod.courseId),
          eq(moduleProgress.status, 'completed'),
        ),
      );
    return [
      `Course: ${course?.title ?? ''}`,
      `Module ${mod.position + 1}/${allModules.length}: ${mod.title}`,
      mod.description,
      `Learner has completed ${completed.length}/${allModules.length} modules.`,
      '',
      'Objectives:',
      ...mod.objectives.map((o) => `- ${o}`),
      '',
      'Lesson:',
      mod.content,
    ].join('\n');
  }
}
