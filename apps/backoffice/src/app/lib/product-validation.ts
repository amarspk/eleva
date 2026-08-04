/**
 * Client-side validation for the Products form (AUDIT-014).
 *
 * Lives in `lib/` rather than inside `ProductsModule.tsx` so it can be unit
 * tested by BOTH Jest runners: the workspace-root config
 * (`testEnvironment: 'node'`, no JSX transform) cannot parse a `.tsx` module,
 * so a spec importing the component file fails with "Jest encountered an
 * unexpected token". Pure logic in a `.ts` file is importable everywhere.
 *
 * These rules mirror the server DTOs (`CreateProductRequestDto` /
 * `UpdateProductRequestDto`). The server remains authoritative; this only
 * avoids a round-trip and attaches the message to the offending field.
 */

export interface ProductFormState {
  categoryId: string;
  name: string;
  basePrice: string;
  description: string;
  calories: string;
  preparationTime: string;
  isAvailable: boolean;
}

export const EMPTY_PRODUCT_FORM: ProductFormState = {
  categoryId: '',
  name: '',
  basePrice: '',
  description: '',
  calories: '',
  preparationTime: '',
  isAvailable: true,
};

export function validateProductForm(
  form: ProductFormState,
  mode: 'create' | 'edit',
): Record<string, string> {
  const errors: Record<string, string> = {};

  if (mode === 'create' && !form.categoryId) {
    errors.categoryId = 'Choose a category.';
  }

  const name = form.name.trim();
  if (name.length < 2 || name.length > 255) {
    errors.name = 'Name must be 2–255 characters.';
  }

  const price = Number(form.basePrice);
  if (form.basePrice.trim() === '' || Number.isNaN(price)) {
    errors.basePrice = 'Enter a price.';
  } else if (price < 0) {
    errors.basePrice = 'Price cannot be negative.';
  }

  if (form.calories.trim() !== '') {
    const calories = Number(form.calories);
    if (!Number.isInteger(calories) || calories < 0) {
      errors.calories = 'Calories must be a whole number of 0 or more.';
    }
  }

  if (form.preparationTime.trim() !== '') {
    const prep = Number(form.preparationTime);
    if (!Number.isInteger(prep) || prep < 0) {
      errors.preparationTime = 'Prep time must be a whole number of minutes.';
    }
  }

  return errors;
}

/** Formats a Prisma Decimal (serialised as a string) for display. */
export function formatPrice(value: string | number): string {
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isNaN(numeric) ? String(value) : numeric.toFixed(2);
}
