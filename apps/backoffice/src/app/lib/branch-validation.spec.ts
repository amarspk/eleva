import {
  validateBranchForm,
  EMPTY_BRANCH_FORM,
  type BranchFormState,
} from './branch-validation';

describe('branch-validation', () => {
  const base: BranchFormState = {
    ...EMPTY_BRANCH_FORM,
    restaurantId: 'r-123',
    name: 'Main Branch',
    address: '123 Main St',
    phoneNumber: '+1234567890',
    operatingHours: '{"mon":"09:00-22:00"}',
  };

  it('passes valid create form', () => {
    const errors = validateBranchForm(base, 'create');
    expect(errors).toEqual({});
  });

  it('requires restaurantId on create', () => {
    const form = { ...base, restaurantId: '' };
    const errors = validateBranchForm(form, 'create');
    expect(errors.restaurantId).toBe('Choose a restaurant.');
  });

  it('rejects short name', () => {
    const form = { ...base, name: 'A' };
    const errors = validateBranchForm(form, 'create');
    expect(errors.name).toMatch(/2–100/);
  });

  it('rejects missing address', () => {
    const form = { ...base, address: '' };
    const errors = validateBranchForm(form, 'create');
    expect(errors.address).toBe('Address is required.');
  });

  it('rejects missing phone', () => {
    const form = { ...base, phoneNumber: '' };
    const errors = validateBranchForm(form, 'create');
    expect(errors.phoneNumber).toBe('Phone number is required.');
  });

  it('rejects invalid operatingHours JSON', () => {
    const form = { ...base, operatingHours: 'not json' };
    const errors = validateBranchForm(form, 'create');
    expect(errors.operatingHours).toMatch(/valid JSON/);
  });

  it('rejects out-of-range latitude', () => {
    const form = { ...base, latitude: '100' };
    const errors = validateBranchForm(form, 'create');
    expect(errors.latitude).toMatch(/-90 and 90/);
  });

  it('rejects out-of-range longitude', () => {
    const form = { ...base, longitude: '200' };
    const errors = validateBranchForm(form, 'create');
    expect(errors.longitude).toMatch(/-180 and 180/);
  });

  it('passes valid edit form (no restaurantId required)', () => {
    const form = { ...base, restaurantId: '' };
    const errors = validateBranchForm(form, 'edit');
    expect(errors.restaurantId).toBeUndefined();
  });

  it('accepts empty lat/lng on edit', () => {
    const form = { ...base, latitude: '', longitude: '' };
    const errors = validateBranchForm(form, 'edit');
    expect(errors.latitude).toBeUndefined();
    expect(errors.longitude).toBeUndefined();
  });
});
