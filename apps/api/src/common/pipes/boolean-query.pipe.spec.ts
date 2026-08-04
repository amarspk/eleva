import 'reflect-metadata';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { BooleanQueryPipe } from './boolean-query.pipe';

/**
 * AUDIT-014 DEFECT-J regression.
 *
 * `includeDeleted` makes the archive/restore UI possible. Two ways it can go
 * wrong, both reproduced at runtime during implementation:
 *
 *  1. A naive `Boolean(value)` treats the STRING "false" as truthy, which would
 *     leak soft-deleted rows on a request that explicitly opted out.
 *  2. Declaring the handler param as `boolean` lets the global ValidationPipe
 *     (`transform: true`) coerce the raw text BEFORE this pipe runs. Measured:
 *     "1" -> false, "0" -> false, "yes" -> false — so `?includeDeleted=1`
 *     silently did nothing and invalid input never produced a 400. The param
 *     must therefore be declared `string`.
 */
describe('BooleanQueryPipe (AUDIT-014 DEFECT-J)', () => {
  const pipe = new BooleanQueryPipe();

  it.each([
    ['true', true],
    ['TRUE', true],
    ['True', true],
    ['1', true],
  ])('treats %s as true', (input, expected) => {
    expect(pipe.transform(input)).toBe(expected);
  });

  it.each([
    ['false', false],
    ['FALSE', false],
    ['0', false],
  ])('treats %s as false', (input, expected) => {
    expect(pipe.transform(input)).toBe(expected);
  });

  it('defaults to false when the parameter is absent', () => {
    expect(pipe.transform(undefined)).toBe(false);
    expect(pipe.transform('')).toBe(false);
  });

  it('never treats the STRING "false" as truthy (the classic bug)', () => {
    // Boolean('false') === true — that mistake would expose archived rows on a
    // request that explicitly asked not to see them.
    expect(pipe.transform('false')).toBe(false);
    expect(Boolean('false')).toBe(true);
  });

  it.each(['yes', 'no', 'maybe', 'null', "'; DROP TABLE products;--", '2'])(
    'rejects %s with 400 instead of silently coercing',
    (input) => {
      expect(() => pipe.transform(input)).toThrow(BadRequestException);
    },
  );

  /**
   * Pins the reason the handler parameter must be declared `string`. If someone
   * "tidies" it back to `boolean`, this documents exactly what breaks.
   */
  describe('interaction with the global ValidationPipe', () => {
    const globalPipe = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    });

    it('mangles the raw value when the param is declared boolean', async () => {
      const asBoolean = { type: 'query' as const, metatype: Boolean, data: 'includeDeleted' };
      expect(await globalPipe.transform('1', asBoolean)).toBe(false);
      expect(await globalPipe.transform('yes', asBoolean)).toBe(false);
    });

    it('passes the raw value through when the param is declared string', async () => {
      const asString = { type: 'query' as const, metatype: String, data: 'includeDeleted' };
      expect(await globalPipe.transform('1', asString)).toBe('1');
      expect(await globalPipe.transform('yes', asString)).toBe('yes');
      // ...which is what lets BooleanQueryPipe do its job correctly.
      expect(pipe.transform((await globalPipe.transform('1', asString)) as string)).toBe(true);
      expect(() => pipe.transform((globalPipe as never) && 'yes')).toThrow(BadRequestException);
    });
  });
});
