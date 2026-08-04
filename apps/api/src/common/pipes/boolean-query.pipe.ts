import { Injectable, PipeTransform, BadRequestException } from '@nestjs/common';

/**
 * Parses an optional boolean query parameter (AUDIT-014).
 *
 * Query strings are always text, so `?includeDeleted=false` arrives as the
 * string `"false"` — which is truthy in JavaScript. A naive `Boolean(value)`
 * would therefore make `includeDeleted=false` *enable* the flag and silently
 * expose soft-deleted rows on a normal list request. Only the exact strings
 * below are accepted; anything else is a 400 rather than a silent coercion.
 *
 * IMPORTANT — declare the handler parameter as `string`, not `boolean`.
 * The global `ValidationPipe` (`transform: true`) runs BEFORE param-scoped
 * pipes and coerces according to the declared metatype. With `boolean` it
 * converted the raw text first, so this pipe only ever received an
 * already-mangled value. Measured against the real pipe:
 *
 *     "true" -> true      "false" -> false
 *     "1"    -> false     "0"     -> false     "yes" -> false
 *
 * i.e. `?includeDeleted=1` silently did nothing and an invalid value never
 * produced a 400. Declaring `string` leaves the raw value intact for this pipe
 * to validate; the handler then receives this pipe's boolean output.
 */
@Injectable()
export class BooleanQueryPipe implements PipeTransform<string | undefined, boolean> {
  transform(value: string | undefined): boolean {
    if (value === undefined || value === null || value === '') {
      return false;
    }
    const normalized = String(value).toLowerCase();
    if (normalized === 'true' || normalized === '1') {
      return true;
    }
    if (normalized === 'false' || normalized === '0') {
      return false;
    }
    throw new BadRequestException(
      `Invalid boolean value [${value}]. Expected one of: true, false, 1, 0.`,
    );
  }
}
