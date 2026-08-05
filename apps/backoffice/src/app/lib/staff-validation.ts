/**
 * Client-side validation for the Staff users form (AUDIT-014 Phase 2 module 6).
 *
 * Mirrors CreateUserRequestDto / UpdateUserRequestDto:
 *   firstName / lastName  1–100 chars
 *   email                  valid email
 *   password               8–128 chars (create required; edit optional)
 *   phoneNumber            optional, max 50
 *   roles                  at least one on create
 *   branchIds              optional array of UUIDs
 */

export interface StaffFormState {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  phoneNumber: string;
  isActive: boolean;
  roles: string[];
  branchIds: string[];
}

export const EMPTY_STAFF_FORM: StaffFormState = {
  firstName: '',
  lastName: '',
  email: '',
  password: '',
  phoneNumber: '',
  isActive: true,
  roles: [],
  branchIds: [],
};

/** Available role names (matching the seed). */
export const ROLE_OPTIONS = ['RESTAURANT_OWNER', 'MANAGER', 'CASHIER', 'KITCHEN'] as const;

export function validateStaffForm(
  form: StaffFormState,
  mode: 'create' | 'edit',
): Record<string, string> {
  const errors: Record<string, string> = {};

  const fn = form.firstName.trim();
  if (!fn || fn.length < 1 || fn.length > 100) {
    errors.firstName = 'First name must be 1–100 characters.';
  }

  const ln = form.lastName.trim();
  if (!ln || ln.length < 1 || ln.length > 100) {
    errors.lastName = 'Last name must be 1–100 characters.';
  }

  const em = form.email.trim();
  if (!em || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) {
    errors.email = 'Valid email is required.';
  }

  if (mode === 'create') {
    if (!form.password || form.password.length < 8) {
      errors.password = 'Password must be at least 8 characters.';
    } else if (form.password.length > 128) {
      errors.password = 'Password must be 128 characters or less.';
    }
  }

  if (mode === 'edit' && form.password && form.password.length < 8) {
    errors.password = 'Password must be at least 8 characters.';
  }

  if (form.phoneNumber && form.phoneNumber.trim().length > 50) {
    errors.phoneNumber = 'Phone number must be 50 characters or less.';
  }

  if (mode === 'create' && form.roles.length === 0) {
    errors.roles = 'At least one role is required.';
  }

  return errors;
}
