import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateWalletPaymentRequestDto } from '../payment/dto/create-wallet-payment-request.dto';
import { CreateTableRequestDto } from '../branch/dto/create-table-request.dto';
import { CreateProductRequestDto } from '../menu/dto/create-product-request.dto';
import { CreateOrderRequestDto } from '../order/dto/create-order-request.dto';
import { PaymentMethodType } from '@zayjar/types';

const VALID_UUID = '11111111-1111-4111-8111-111111111111';

/**
 * Production-readiness audit — UUID body fields must be validated.
 *
 * Every `*Id` column in the schema is `@db.Uuid`. Several DTOs guarded those
 * fields with `@IsString()` only, so a non-UUID value passed validation,
 * reached Prisma and raised `Inconsistent column data: Error creating UUID`,
 * which escaped as an unhandled **HTTP 500**.
 *
 * Runtime-proven before this fix:
 *   POST /api/v1/payments/wallet  {"orderId":"not-a-uuid"}   -> 500
 *   POST /api/v1/tables           {"branchId":"not-a-uuid"}  -> 500
 *
 * A malformed id is a client error (400). Reporting it as a server fault
 * corrupts error budgets, triggers false alerts, and leaks driver internals.
 */
describe('DTO UUID validation (no 500s from malformed ids)', () => {
  const errorsFor = async (cls: never, payload: Record<string, unknown>): Promise<string[]> => {
    const dto = plainToInstance(cls, payload);
    const errors = await validate(dto as object, { whitelist: true });
    return errors.map((e) => e.property);
  };

  describe('CreateWalletPaymentRequestDto.orderId', () => {
    it('rejects a non-UUID orderId', async () => {
      const props = await errorsFor(CreateWalletPaymentRequestDto as never, {
        orderId: 'not-a-uuid',
        paymentMethod: PaymentMethodType.LOCAL_WALLET,
        amount: 10,
      });
      expect(props).toContain('orderId');
    });

    it('accepts a well-formed orderId', async () => {
      const props = await errorsFor(CreateWalletPaymentRequestDto as never, {
        orderId: VALID_UUID,
        paymentMethod: PaymentMethodType.LOCAL_WALLET,
        amount: 10,
      });
      expect(props).not.toContain('orderId');
    });
  });

  describe('CreateTableRequestDto.branchId', () => {
    it('rejects a non-UUID branchId', async () => {
      const props = await errorsFor(CreateTableRequestDto as never, {
        branchId: 'not-a-uuid',
        number: 'T1',
        seatingCapacity: 4,
      });
      expect(props).toContain('branchId');
    });

    it('accepts a well-formed branchId', async () => {
      const props = await errorsFor(CreateTableRequestDto as never, {
        branchId: VALID_UUID,
        number: 'T1',
        seatingCapacity: 4,
      });
      expect(props).not.toContain('branchId');
    });
  });

  describe('CreateProductRequestDto.categoryId', () => {
    it('rejects a non-UUID categoryId', async () => {
      const props = await errorsFor(CreateProductRequestDto as never, {
        categoryId: 'not-a-uuid',
        name: 'Burger',
        basePrice: 10,
      });
      expect(props).toContain('categoryId');
    });
  });

  describe('CreateOrderRequestDto nested item ids', () => {
    it('rejects a non-UUID productId inside items[]', async () => {
      const dto = plainToInstance(CreateOrderRequestDto as never, {
        branchId: VALID_UUID,
        type: 'DINE_IN',
        paymentMethod: 'CASH',
        items: [{ productId: 'not-a-uuid', quantity: 1 }],
      });
      const errors = await validate(dto as object, { whitelist: true });
      // Nested validation surfaces as an error on `items`.
      expect(errors.map((e) => e.property)).toContain('items');
    });

    it('accepts well-formed nested ids', async () => {
      const dto = plainToInstance(CreateOrderRequestDto as never, {
        branchId: VALID_UUID,
        type: 'DINE_IN',
        paymentMethod: 'CASH',
        items: [{ productId: VALID_UUID, quantity: 1 }],
      });
      const errors = await validate(dto as object, { whitelist: true });
      expect(errors.map((e) => e.property)).not.toContain('items');
    });
  });
});
