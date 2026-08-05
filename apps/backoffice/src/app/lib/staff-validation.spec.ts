import {
  validateStaffForm,
  EMPTY_STAFF_FORM,
  type StaffFormState,
  ROLE_OPTIONS,
} from './staff-validation';

describe('staff-validation', () => {
  const base: StaffFormState = {
    ...EMPTY_STAFF_FORM,
    firstName: 'Ahmed',
    lastName: 'Al-Rashid',
    email: 'ahmed@albaik.com',
    password: 'Str0ngP@ss',
    phoneNumber: '+968 9911 2233',
    isActive: true,
    roles: ['CASHIER'],
    branchIds: [],
  };

  // ── create mode ──

  it('passes valid create form', () => {
    const errors = validateStaffForm(base, 'create');
    expect(errors).toEqual({});
  });

  it('requires firstName on create', () => {
    const form = { ...base, firstName: '' };
    const errors = validateStaffForm(form, 'create');
    expect(errors.firstName).toMatch(/1–100/);
  });

  it('rejects too-long firstName on create', () => {
    const form = { ...base, firstName: 'A'.repeat(101) };
    const errors = validateStaffForm(form, 'create');
    expect(errors.firstName).toMatch(/1–100/);
  });

  it('requires lastName on create', () => {
    const form = { ...base, lastName: '' };
    const errors = validateStaffForm(form, 'create');
    expect(errors.lastName).toMatch(/1–100/);
  });

  it('requires valid email on create', () => {
    const form = { ...base, email: 'not-an-email' };
    const errors = validateStaffForm(form, 'create');
    expect(errors.email).toMatch(/email/i);
  });

  it('requires password ≥ 8 chars on create', () => {
    const form = { ...base, password: 'short' };
    const errors = validateStaffForm(form, 'create');
    expect(errors.password).toMatch(/at least 8/);
  });

  it('rejects password > 128 chars on create', () => {
    const form = { ...base, password: 'x'.repeat(129) };
    const errors = validateStaffForm(form, 'create');
    expect(errors.password).toMatch(/128/);
  });

  it('accepts optional phoneNumber on create', () => {
    const form = { ...base, phoneNumber: '' };
    const errors = validateStaffForm(form, 'create');
    expect(errors.phoneNumber).toBeUndefined();
  });

  it('rejects too-long phoneNumber on create', () => {
    const form = { ...base, phoneNumber: '1'.repeat(51) };
    const errors = validateStaffForm(form, 'create');
    expect(errors.phoneNumber).toMatch(/50/);
  });

  it('requires at least one role on create', () => {
    const form = { ...base, roles: [] };
    const errors = validateStaffForm(form, 'create');
    expect(errors.roles).toMatch(/at least one role/i);
  });

  it('accepts multiple roles on create', () => {
    const form = { ...base, roles: ['MANAGER', 'CASHIER'] };
    const errors = validateStaffForm(form, 'create');
    expect(errors.roles).toBeUndefined();
  });

  it('exposes ROLE_OPTIONS with all four roles', () => {
    expect(ROLE_OPTIONS).toEqual([
      'RESTAURANT_OWNER',
      'MANAGER',
      'CASHIER',
      'KITCHEN',
    ]);
  });

  // ── edit mode ──

  it('passes valid edit form', () => {
    const errors = validateStaffForm(base, 'edit');
    expect(errors).toEqual({});
  });

  it('password is optional on edit', () => {
    const form = { ...base, password: '' };
    const errors = validateStaffForm(form, 'edit');
    expect(errors.password).toBeUndefined();
  });

  it('validates password length when provided on edit', () => {
    const form = { ...base, password: 'short' };
    const errors = validateStaffForm(form, 'edit');
    expect(errors.password).toMatch(/at least 8/);
  });

  it('roles not required on edit (omit = no change)', () => {
    const form = { ...base, roles: [] };
    const errors = validateStaffForm(form, 'edit');
    expect(errors.roles).toBeUndefined();
  });

  it('requires firstName on edit', () => {
    const form = { ...base, firstName: '' };
    const errors = validateStaffForm(form, 'edit');
    expect(errors.firstName).toMatch(/1–100/);
  });

  it('requires lastName on edit', () => {
    const form = { ...base, lastName: '' };
    const errors = validateStaffForm(form, 'edit');
    expect(errors.lastName).toMatch(/1–100/);
  });

  it('requires valid email on edit', () => {
    const form = { ...base, email: 'bad' };
    const errors = validateStaffForm(form, 'edit');
    expect(errors.email).toMatch(/email/i);
  });

  // ── whitespace ──

  it('rejects whitespace-only firstName', () => {
    const form = { ...base, firstName: '   ' };
    const errors = validateStaffForm(form, 'create');
    expect(errors.firstName).toMatch(/1–100/);
  });
});
