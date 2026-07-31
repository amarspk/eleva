import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthenticatedRequest, AuthenticatedUser } from '../../common/types/request.types';

export const CurrentUser = createParamDecorator(
  (data: string | undefined, ctx: ExecutionContext): AuthenticatedUser | string | string[] | null | undefined => {
    const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;
    return data ? user?.[data as keyof AuthenticatedUser] : user;
  },
);
