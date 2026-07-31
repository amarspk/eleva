import { CustomDecorator, SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';
// CAT-5: `SetMetadata<K extends string = string, V = any>` returns `CustomDecorator<K>`
// (the VALUE type is not the generic). The former `SetMetadata<boolean>`
// instantiation set K=boolean, breaking `K extends string`. Correct annotation,
// zero runtime change (annotations are erased).
export const Public = (): CustomDecorator<string> => SetMetadata(IS_PUBLIC_KEY, true);
