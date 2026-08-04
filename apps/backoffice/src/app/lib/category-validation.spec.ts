import { validateCategoryForm, EMPTY_CATEGORY_FORM } from './category-validation';

/**
 * AUDIT-014 — Categories form validation.
 *
 * Mirrors `CreateCategoryRequestDto` / `UpdateCategoryRequestDto`. Each rule
 * below was confirmed against the live API during the adversarial run
 * (name > 100 chars, negative sortOrder and fractional sortOrder all return
 * HTTP 400), so the client and server agree.
 */
describe('validateCategoryForm', () => {
  const valid = {
    restaurantId: 'e0478415-1234-4abc-8def-000000000000',
    name: 'Appetizers',
    sortOrder: '3',
    isActive: true,
  };

  it('accepts a well-formed category', () => {
    expect(validateCategoryForm(valid, 'create')).toEqual({});
  });

  it('requires a restaurant when creating', () => {
    expect(validateCategoryForm({ ...valid, restaurantId: '' }, 'create')).toHaveProperty(
      'restaurantId',
    );
  });

  it('does NOT require a restaurant when editing', () => {
    // `restaurantId` is absent from UpdateCategoryRequestDto entirely —
    // re-parenting would silently move every product under the category, and
    // the server rejects it with "property restaurantId should not exist".
    expect(validateCategoryForm({ ...valid, restaurantId: '' }, 'edit')).not.toHaveProperty(
      'restaurantId',
    );
  });

  it.each([['x'], [''], ['A'.repeat(101)]])('rejects invalid name %#', (name) => {
    expect(validateCategoryForm({ ...valid, name }, 'create')).toHaveProperty('name');
  });

  it('accepts 2-char and 100-char names (server boundaries)', () => {
    expect(validateCategoryForm({ ...valid, name: 'ab' }, 'create')).not.toHaveProperty('name');
    expect(validateCategoryForm({ ...valid, name: 'A'.repeat(100) }, 'create')).not.toHaveProperty(
      'name',
    );
  });

  it('trims whitespace before measuring the name', () => {
    expect(validateCategoryForm({ ...valid, name: '   ' }, 'create')).toHaveProperty('name');
  });

  it('accepts sortOrder 0 (first on the menu)', () => {
    expect(validateCategoryForm({ ...valid, sortOrder: '0' }, 'create')).not.toHaveProperty(
      'sortOrder',
    );
  });

  it.each([['-1'], ['1.5'], ['abc'], ['']])('rejects invalid sortOrder %s', (sortOrder) => {
    expect(validateCategoryForm({ ...valid, sortOrder }, 'create')).toHaveProperty('sortOrder');
  });

  it('reports every problem at once', () => {
    const errors = validateCategoryForm(
      { restaurantId: '', name: 'x', sortOrder: '-2', isActive: true },
      'create',
    );
    expect(Object.keys(errors).sort()).toEqual(['name', 'restaurantId', 'sortOrder']);
  });

  it('the empty form is invalid on create (guards against blank submits)', () => {
    expect(Object.keys(validateCategoryForm(EMPTY_CATEGORY_FORM, 'create')).length).toBeGreaterThan(0);
  });
});
