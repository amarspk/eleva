import { IsArray, IsUUID } from 'class-validator';

/**
 * Branch assignment payload (AUDIT-004 / DOC-005 §4.2). Replacement semantics:
 * the supplied list becomes the user's complete branch scope. An empty array
 * is valid and clears all branch scoping.
 */
export class AssignBranchesRequestDto {
  @IsArray()
  @IsUUID('4', { each: true })
  branchIds!: string[];
}
