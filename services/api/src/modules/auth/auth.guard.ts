import {
  Injectable,
  Inject,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import type { IAuthProvider } from '@autodidact/providers';
import type { AuthUser } from '@autodidact/types';
import { AUTH_PROVIDER_TOKEN } from '../../providers.token.js';

@Injectable()
export class AuthGuard implements CanActivate {
  // IAuthProvider is an interface (erased at runtime), so the injection token
  // must be explicit. Without @Inject, `@UseGuards(AuthGuard)` in feature
  // modules makes Nest instantiate the guard from its reflected constructor
  // type (Object) and fail to resolve the provider. The @Global AuthModule
  // exports AUTH_PROVIDER_TOKEN, so this resolves in every module context.
  constructor(@Inject(AUTH_PROVIDER_TOKEN) private readonly authProvider: IAuthProvider) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const authHeader = request.headers['authorization'];

    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing authorization header');
    }

    const token = authHeader.slice(7);
    try {
      request.user = await this.authProvider.verifyToken(token);
      return true;
    } catch {
      throw new UnauthorizedException('Invalid token');
    }
  }
}
