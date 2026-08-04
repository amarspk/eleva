import {
  validateCustomerForm,
  EMPTY_CUSTOMER_FORM,
  type CustomerFormState,
} from './customer-validation';

describe('customer-validation', () => {
  const base: CustomerFormState = {
    ...EMPTY_CUSTOMER_FORM,
    firstName: 'Noura',
    lastName: 'Saeed',
    email: 'noura@example.com',
    phoneNumber: '+968 9911 2233',
    loyaltyPoints: '10',
  };

  // ── create mode ──

  it('passes valid create form', () => {
    const errors = validateCustomerForm(base, 'create');
    expect(errors).toEqual({});
  });

  it('requires firstName on create', () => {
    const form = { ...base, firstName: '' };
    const errors = validateCustomerForm(form, 'create');
    expect(errors.firstName).toMatch(/1–50/);
  });

  it('rejects too-long firstName on create', () => {
    const form = { ...base, firstName: 'A'.repeat(51) };
    const errors = validateCustomerForm(form, 'create');
    expect(errors.firstName).toMatch(/1–50/);
  });

  it('requires lastName on create', () => {
    const form = { ...base, lastName: '' };
    const errors = validateCustomerForm(form, 'create');
    expect(errors.lastName).toMatch(/1–50/);
  });

  it('rejects too-long lastName on create', () => {
    const form = { ...base, lastName: 'B'.repeat(51) };
    const errors = validateCustomerForm(form, 'create');
    expect(errors.lastName).toMatch(/1–50/);
  });

  it('requires valid email on create', () => {
    const form = { ...base, email: '' };
    const errors = validateCustomerForm(form, 'create');
    expect(errors.email).toMatch(/email/i);
  });

  it('rejects malformed email on create', () => {
    const form = { ...base, email: 'not-an-email' };
    const errors = validateCustomerForm(form, 'create');
    expect(errors.email).toMatch(/email/i);
  });

  it('accepts optional phoneNumber on create', () => {
    const form = { ...base, phoneNumber: '' };
    const errors = validateCustomerForm(form, 'create');
    expect(errors.phoneNumber).toBeUndefined();
  });

  it('rejects too-long phoneNumber on create', () => {
    const form = { ...base, phoneNumber: '1'.repeat(31) };
    const errors = validateCustomerForm(form, 'create');
    expect(errors.phoneNumber).toMatch(/30/);
  });

  it('ignores loyaltyPoints on create (not an edit field)', () => {
    const form = { ...base, loyaltyPoints: '-5' };
    const errors = validateCustomerForm(form, 'create');
    expect(errors.loyaltyPoints).toBeUndefined();
  });

  // ── edit mode ──

  it('passes valid edit form', () => {
    const errors = validateCustomerForm(base, 'edit');
    expect(errors).toEqual({});
  });

  it('requires firstName on edit', () => {
    const form = { ...base, firstName: '' };
    const errors = validateCustomerForm(form, 'edit');
    expect(errors.firstName).toMatch(/1–50/);
  });

  it('requires lastName on edit', () => {
    const form = { ...base, lastName: '' };
    const errors = validateCustomerForm(form, 'edit');
    expect(errors.lastName).toMatch(/1–50/);
  });

  it('requires valid email on edit', () => {
    const form = { ...base, email: 'bad' };
    const errors = validateCustomerForm(form, 'edit');
    expect(errors.email).toMatch(/email/i);
  });

  it('validates loyaltyPoints >= 0 on edit', () => {
    const form = { ...base, loyaltyPoints: '-1' };
    const errors = validateCustomerForm(form, 'edit');
    expect(errors.loyaltyPoints).toMatch(/0 or greater/);
  });

  it('rejects non-numeric loyaltyPoints on edit', () => {
    const form = { ...base, loyaltyPoints: 'abc' };
    const errors = validateCustomerForm(form, 'edit');
    expect(errors.loyaltyPoints).toMatch(/0 or greater/);
  });

  it('accepts zero loyaltyPoints on edit', () => {
    const form = { ...base, loyaltyPoints: '0' };
    const errors = validateCustomerForm(form, 'edit');
    expect(errors.loyaltyPoints).toBeUndefined();
  });

  it('accepts large loyaltyPoints on edit', () => {
    const form = { ...base, loyaltyPoints: '99999' };
    const errors = validateCustomerForm(form, 'edit');
    expect(errors.loyaltyPoints).toBeUndefined();
  });

  // ── whitespace trimming ──

  it('rejects whitespace-only firstName', () => {
    const form = { ...base, firstName: '   ' };
    const errors = validateCustomerForm(form, 'create');
    expect(errors.firstName).toMatch(/1–50/);
  });

  it('rejects whitespace-only lastName', () => {
    const form = { ...base, lastName: '   ' };
    const errors = validateCustomerForm(form, 'create');
    expect(errors.lastName).toMatch(/1–50/);
  });
});
