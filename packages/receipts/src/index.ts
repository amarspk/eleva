/**
 * @zayjar/receipts — shared receipt/kitchen-ticket rendering (Phase 4 P3).
 *
 * Used by the cashier app (production printing) and the backoffice app
 * (Receipt Designer live preview). Rendering is defined once here so the two
 * apps never drift apart.
 */
export * from './receipt-types';
export * from './receipt-config';
export * from './i18n';
export * from './format';
export * from './print';
export { CustomerReceipt } from './CustomerReceipt';
export { KitchenTicket } from './KitchenTicket';
