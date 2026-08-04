/**
 * Client-side validation for the Categories form (AUDIT-014).
 *
 * Lives in `lib/` as a plain `.ts` module so BOTH Jest runners can import it —
 * the workspace-root config uses `testEnvironment: 'node'` with no JSX
 * transform and cannot parse a `.tsx` component file.
 *
 * Mirrors `CreateCategoryRequestDto` / `UpdateCategoryRequestDto`:
 *   name       2–100 chars (server: @Length(2, 100))
 *   sortOrder  integer >= 0 (server: @IsInt @Min(0))
 * The server remains authoritative; this only avoids a round-trip and attaches
 * the message to the offending field.
 */

export interface CategoryFormState {
  restaurantId: string;
  name: string;
  sortOrder: string;
  isActive: boolean;
}

export const EMPTY_CATEGORY_FORM: CategoryFormState = {
  restaurantId: '',
  name: '',
  sortOrder: '0',
  isActive: true,
};

export function validateCategoryForm(
  form: CategoryFormState,
  mode: 'create' | 'edit',
): Record<string, string> {
  const errors: Record<string, string> = {};

  // `restaurantId` is required on create and is NOT accepted by the update DTO
  // at all — re-parenting a category would silently move every product under it.
  if (mode === 'create' && !form.restaurantId) {
    errors.restaurantId = 'Choose a restaurant.';
  }

  const name = form.name.trim();
  if (name.length < 2 || name.length > 100) {
    errors.name = 'Name must be 2–100 characters.';
  }

  if (form.sortOrder.trim() === '') {
    errors.sortOrder = 'Enter a sort order.';
  } else {
    const sortOrder = Number(form.sortOrder);
    if (!Number.isInteger(sortOrder) || sortOrder < 0) {
      errors.sortOrder = 'Sort order must be a whole number of 0 or more.';
    }
  }

  return errors;
}
