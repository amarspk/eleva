import { BadRequestException } from '@nestjs/common';
import { OptionalUuidPipe } from './optional-uuid.pipe';

/**
 * Production-readiness audit — malformed UUID filters must be 400, not 500.
 *
 * Runtime-verified before this pipe existed:
 *   GET /api/v1/menu/products?categoryId=not-a-uuid  -> 500
 *   GET /api/v1/tables?branchId=not-a-uuid           -> 500
 *   GET /api/v1/users?branchId=not-a-uuid            -> 500
 *   GET /api/v1/orders?branchId=not-a-uuid           -> 500
 * Prisma raised `Inconsistent column data: Error creating UUID` against the
 * `@db.Uuid` columns and it escaped as an unhandled server error.
 */
describe('OptionalUuidPipe', () => {
  const pipe = new OptionalUuidPipe();

  it('passes a well-formed uuid through unchanged', () => {
    const id = '11111111-1111-4111-8111-111111111111';
    expect(pipe.transform(id)).toBe(id);
  });

  it('treats undefined as "no filter" (parameter is optional)', () => {
    expect(pipe.transform(undefined)).toBeUndefined();
  });

  it('treats an empty string as "no filter"', () => {
    expect(pipe.transform('')).toBeUndefined();
  });

  it('rejects a non-uuid value with 400 instead of reaching Prisma', () => {
    expect(() => pipe.transform('not-a-uuid')).toThrow(BadRequestException);
  });

  it('rejects an SQL-injection style filter value with 400', () => {
    expect(() => pipe.transform("1';DROP TABLE users;--")).toThrow(BadRequestException);
  });

  it('rejects a uuid-like string of the wrong length', () => {
    expect(() => pipe.transform('11111111-1111-4111-8111-1111')).toThrow(BadRequestException);
  });
});
