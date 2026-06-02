import { Module, Global } from '@nestjs/common';
import { createQueueProvider } from '@autodidact/providers';
import { QUEUE_PROVIDER_TOKEN } from '../../providers.token.js';

/**
 * Global queue module.
 *
 * `QUEUE_PROVIDER_TOKEN` is consumed by feature modules (e.g. CoursesModule's
 * CoursesService). Declaring it inline in AppModule does NOT make it injectable
 * there: a provider declared in a module is visible to that module and to the
 * modules that IMPORT it — not to the modules it imports. CoursesModule is
 * imported by AppModule, so it cannot see an AppModule-local provider.
 *
 * Mirroring AuthModule, this `@Global()` module makes the queue provider
 * injectable everywhere it is needed without each feature module re-importing it.
 */
@Global()
@Module({
  providers: [
    {
      provide: QUEUE_PROVIDER_TOKEN,
      useFactory: async () => createQueueProvider(),
    },
  ],
  exports: [QUEUE_PROVIDER_TOKEN],
})
export class QueueModule {}
