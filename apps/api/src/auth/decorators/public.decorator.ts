import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';
export const Public = (): ReturnType<typeof SetMetadata<boolean>> => SetMetadata(IS_PUBLIC_KEY, true);
