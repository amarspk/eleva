/**
 * Client-side validation for the Tables form (AUDIT-014 Phase 2 module 4).
 *
 * Lives in `lib/` as a plain `.ts` module so BOTH Jest runners can import it.
 *
 * Mirrors CreateTableRequestDto / UpdateTableRequestDto:
 *   branchId         required (create only)
 *   number           1–20 chars (create only)
 *   seatingCapacity  1–100 (create + update)
 *   status           one of TABLE_STATUSES (update only)
 *
 * branchId + number are immutable once created (deterministic QR HMAC of tenantId:branchId:number).
 * The server remains authoritative; this only avoids a round-trip.
 */

export const TABLE_STATUSES = ['VACANT', 'OCCUPIED', 'RESERVED', 'DIRTY'] as const;
export type TableStatus = (typeof TABLE_STATUSES)[number];

export interface TableFormState {
  branchId: string;
  number: string;
  seatingCapacity: string; // string in form for input control
  status: TableStatus;
}

export const EMPTY_TABLE_FORM: TableFormState = {
  branchId: '',
  number: '',
  seatingCapacity: '4',
  status: 'VACANT',
};

export function validateTableForm(
  form: TableFormState,
  mode: 'create' | 'edit',
): Record<string, string> {
  const errors: Record<string, string> = {};

  if (mode === 'create') {
    if (!form.branchId) {
      errors.branchId = 'Choose a branch.';
    }

    const num = form.number.trim();
    if (!num || num.length < 1 || num.length > 20) {
      errors.number = 'Table number must be 1–20 characters.';
    }
  }

  const capStr = form.seatingCapacity.trim();
  const cap = Number(capStr);
  if (!capStr || Number.isNaN(cap) || cap < 1 || cap > 100) {
    errors.seatingCapacity = 'Seating capacity must be between 1 and 100.';
  }

  if (mode === 'edit' && !TABLE_STATUSES.includes(form.status as TableStatus)) {
    errors.status = 'Invalid table status.';
  }

  return errors;
}
