-- Add Order.paymentMethod persistence (Sprint 2 Task 3 — §15 item 3).
--
-- The public/staff checkout contract (CreateOrderRequestDto) accepts a
-- paymentMethod enum and the guest UI sends CASH, but the Order model had no
-- such column, so the value was silently dropped and the response field was
-- null. The PaymentMethodType PostgreSQL enum already exists (created by the
-- init migration for the payments table).
--
-- The column is nullable so pre-existing rows are not fabricated: the payment
-- method for historical orders was genuinely not captured, so they keep NULL
-- ("unknown"). New orders always set it from the DTO (the service writes
-- dto.paymentMethod on every create).

ALTER TABLE "orders" ADD COLUMN "paymentMethod" "PaymentMethodType";
