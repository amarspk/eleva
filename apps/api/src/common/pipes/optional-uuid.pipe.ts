import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';

const UUID_PATTERN =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/**
 * Validates an OPTIONAL uuid query parameter.
 *
 * Every id column in the schema is `@db.Uuid`. When a caller passes a
 * non-UUID filter value (`?categoryId=not-a-uuid`) Prisma raises
 * `Inconsistent column data: Error creating UUID …`, which escapes as an
 * unhandled **HTTP 500** — runtime-verified on
 * `/menu/products?categoryId=`, `/tables?branchId=`, `/users?branchId=` and
 * `/orders?branchId=`. A malformed filter is a client mistake (400) and
 * reporting it as a server fault corrupts error budgets and alerting.
 *
 * `ParseUUIDPipe` cannot be used directly here because these parameters are
 * optional: it rejects `undefined`. This pipe passes `undefined`/empty through
 * untouched and validates only when a value is actually supplied.
 */
@Injectable()
export class OptionalUuidPipe implements PipeTransform<string | undefined, string | undefined> {
  transform(value: string | undefined): string | undefined {
    if (value === undefined || value === null || value === '') {
      return undefined;
    }

    if (!UUID_PATTERN.test(value)) {
      throw new BadRequestException('Expected a UUID for this filter parameter.');
    }

    return value;
  }
}
