import { IsString, IsNotEmpty, IsInt, Min, Max, IsOptional, IsIn, Length } from 'class-validator';

/**
 * Valid `TableStatus` values (packages/db/prisma/schema.prisma).
 *
 * Declared as a literal list rather than imported from `@zayjar/db` so the
 * validation constraint is enforced by `class-validator` at the HTTP edge. An
 * unconstrained string would reach the Postgres enum column and fail as an
 * unhandled 500 instead of a 400.
 */
export const TABLE_STATUSES = ['VACANT', 'OCCUPIED', 'RESERVED', 'DIRTY'] as const;

/**
 * Partial update payload for `PUT /api/v1/tables/:id` (AUDIT-007).
 *
 * `branchId` is deliberately NOT updatable. The table's QR token is a
 * deterministic HMAC of `tenantId:branchId:number` (branch.service.ts), so
 * moving a table between branches would either invalidate every printed QR
 * sticker or leave a token that no longer matches its own payload.
 *
 * `number` is likewise NOT updatable for the same reason — the printed sticker
 * encodes it. Renumbering is done by soft-deleting the table and creating the
 * replacement, which is now safe because the QR unique index was made partial
 * (migration 20260804000000).
 */
export class UpdateTableRequestDto {
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  seatingCapacity?: number;

  @IsString()
  @IsNotEmpty()
  @Length(1, 20)
  @IsIn(TABLE_STATUSES as unknown as string[])
  @IsOptional()
  status?: string;
}
