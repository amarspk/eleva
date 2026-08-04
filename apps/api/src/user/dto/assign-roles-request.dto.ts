import { IsArray, IsString, ArrayNotEmpty } from 'class-validator';

/**
 * Role assignment payload (AUDIT-004). Replacement semantics: the supplied
 * list becomes the user's complete role set.
 */
export class AssignRolesRequestDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  roles!: string[];
}
