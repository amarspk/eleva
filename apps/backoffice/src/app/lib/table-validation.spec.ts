import {
  validateTableForm,
  EMPTY_TABLE_FORM,
  type TableFormState,
  TABLE_STATUSES,
} from './table-validation';

describe('table-validation', () => {
  const base: TableFormState = {
    ...EMPTY_TABLE_FORM,
    branchId: 'b-123',
    number: 'T-12',
    seatingCapacity: '6',
    status: 'VACANT',
  };

  it('passes valid create form', () => {
    const errors = validateTableForm(base, 'create');
    expect(errors).toEqual({});
  });

  it('requires branchId on create', () => {
    const form = { ...base, branchId: '' };
    const errors = validateTableForm(form, 'create');
    expect(errors.branchId).toBe('Choose a branch.');
  });

  it('rejects empty table number on create', () => {
    const form = { ...base, number: '' };
    const errors = validateTableForm(form, 'create');
    expect(errors.number).toMatch(/1–20/);
  });

  it('rejects too-long table number on create', () => {
    const form = { ...base, number: 'A'.repeat(21) };
    const errors = validateTableForm(form, 'create');
    expect(errors.number).toMatch(/1–20/);
  });

  it('rejects seatingCapacity below 1', () => {
    const form = { ...base, seatingCapacity: '0' };
    const errors = validateTableForm(form, 'create');
    expect(errors.seatingCapacity).toMatch(/1 and 100/);
  });

  it('rejects seatingCapacity above 100', () => {
    const form = { ...base, seatingCapacity: '101' };
    const errors = validateTableForm(form, 'create');
    expect(errors.seatingCapacity).toMatch(/1 and 100/);
  });

  it('rejects non-numeric seatingCapacity', () => {
    const form = { ...base, seatingCapacity: 'abc' };
    const errors = validateTableForm(form, 'create');
    expect(errors.seatingCapacity).toMatch(/1 and 100/);
  });

  it('passes valid edit form (branchId and number not required)', () => {
    const form = { ...base, branchId: '', number: '' };
    const errors = validateTableForm(form, 'edit');
    expect(errors.branchId).toBeUndefined();
    expect(errors.number).toBeUndefined();
    expect(errors.seatingCapacity).toBeUndefined();
  });

  it('accepts valid status on edit', () => {
    TABLE_STATUSES.forEach((status) => {
      const form = { ...base, status };
      const errors = validateTableForm(form, 'edit');
      expect(errors.status).toBeUndefined();
    });
  });

  it('rejects invalid status on edit (defensive)', () => {
    const form = { ...base, status: 'UNKNOWN' as any };
    const errors = validateTableForm(form, 'edit');
    expect(errors.status).toBe('Invalid table status.');
  });

  it('accepts edit with valid seatingCapacity update only', () => {
    const form = { ...base, branchId: '', number: '', seatingCapacity: '12', status: 'DIRTY' };
    const errors = validateTableForm(form, 'edit');
    expect(errors).toEqual({});
  });
});
