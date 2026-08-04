import { validateProductForm } from './product-validation';

/**
 * AUDIT-014 — client-side validation for the Products form.
 *
 * These rules mirror the server DTOs (`CreateProductRequestDto` /
 * `UpdateProductRequestDto`). The server stays authoritative — this only spares
 * the operator a round-trip and shows the error against the offending field.
 * If the two ever drift, the server still rejects the request, so these tests
 * pin the *client* contract only.
 */
describe('validateProductForm', () => {
  const valid = {
    categoryId: '9e8deaff-c4eb-41b0-8eb5-2d9bf78e80bb',
    name: 'Falafel Wrap',
    basePrice: '12.50',
    description: '',
    calories: '',
    preparationTime: '',
    isAvailable: true,
  };

  it('accepts a well-formed product', () => {
    expect(validateProductForm(valid, 'create')).toEqual({});
  });

  it('requires a category when creating', () => {
    expect(validateProductForm({ ...valid, categoryId: '' }, 'create')).toHaveProperty('categoryId');
  });

  it('does not require a category when editing (partial update)', () => {
    expect(validateProductForm({ ...valid, categoryId: '' }, 'edit')).not.toHaveProperty('categoryId');
  });

  it.each([['x'], [''], ['A'.repeat(256)]])('rejects invalid name %#', (name) => {
    expect(validateProductForm({ ...valid, name }, 'create')).toHaveProperty('name');
  });

  it('accepts a 2-character and a 255-character name (boundaries)', () => {
    expect(validateProductForm({ ...valid, name: 'ab' }, 'create')).not.toHaveProperty('name');
    expect(validateProductForm({ ...valid, name: 'A'.repeat(255) }, 'create')).not.toHaveProperty('name');
  });

  it('trims whitespace before measuring the name', () => {
    expect(validateProductForm({ ...valid, name: '   ' }, 'create')).toHaveProperty('name');
  });

  it('rejects a negative price', () => {
    expect(validateProductForm({ ...valid, basePrice: '-1' }, 'create')).toHaveProperty('basePrice');
  });

  it('accepts a zero price (a free item is legitimate)', () => {
    expect(validateProductForm({ ...valid, basePrice: '0' }, 'create')).not.toHaveProperty('basePrice');
  });

  it.each([['', 'empty'], ['abc', 'non-numeric']])('rejects %s price (%s)', (basePrice) => {
    expect(validateProductForm({ ...valid, basePrice }, 'create')).toHaveProperty('basePrice');
  });

  it('rejects fractional or negative calories', () => {
    expect(validateProductForm({ ...valid, calories: '1.5' }, 'create')).toHaveProperty('calories');
    expect(validateProductForm({ ...valid, calories: '-10' }, 'create')).toHaveProperty('calories');
  });

  it('allows calories to be omitted', () => {
    expect(validateProductForm({ ...valid, calories: '' }, 'create')).not.toHaveProperty('calories');
  });

  it('rejects fractional or negative prep time', () => {
    expect(validateProductForm({ ...valid, preparationTime: '2.5' }, 'create')).toHaveProperty(
      'preparationTime',
    );
    expect(validateProductForm({ ...valid, preparationTime: '-3' }, 'create')).toHaveProperty(
      'preparationTime',
    );
  });

  it('reports every problem at once rather than one at a time', () => {
    const errors = validateProductForm(
      { ...valid, categoryId: '', name: 'x', basePrice: '-5', calories: 'abc' },
      'create',
    );
    expect(Object.keys(errors).sort()).toEqual(['basePrice', 'calories', 'categoryId', 'name']);
  });
});
