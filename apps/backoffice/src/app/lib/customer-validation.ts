/**
 * Client-side validation for the Customers form (AUDIT-014 Phase 2 module 5).
 *
 * Lives in `lib/` as a plain `.ts` module so BOTH Jest runners can import it.
 *
 * Mirrors CreateCustomerRequestDto / UpdateCustomerRequestDto:
 *   firstName / lastName   1–50 chars (required create + update)
 *   email                  valid email (required create + update)
 *   phoneNumber            optional, max 30
 *   loyaltyPoints          >= 0 (update only)
 */

export interface CustomerFormState {
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber: string;
  loyaltyPoints: string; // string in form
}

export const EMPTY_CUSTOMER_FORM: CustomerFormState = {
  firstName: '',
  lastName: '',
  email: '',
  phoneNumber: '',
  loyaltyPoints: '0',
};

export function validateCustomerForm(
  form: CustomerFormState,
  mode: 'create' | 'edit',
): Record<string, string> {
  const errors: Record<string, string> = {};

  const fn = form.firstName.trim();
  if (!fn || fn.length < 1 || fn.length > 50) {
    errors.firstName = 'First name must be 1–50 characters.';
  }

  const ln = form.lastName.trim();
  if (!ln || ln.length < 1 || ln.length > 50) {
    errors.lastName = 'Last name must be 1–50 characters.';
  }

  const em = form.email.trim();
  if (!em || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) {
    errors.email = 'Valid email is required.';
  }

  if (form.phoneNumber && form.phoneNumber.trim().length > 30) {
    errors.phoneNumber = 'Phone number must be 30 characters or less.';
  }

  if (mode === 'edit') {
    const lpStr = form.loyaltyPoints.trim();
    const lp = Number(lpStr);
    if (!lpStr || Number.isNaN(lp) || lp < 0) {
      errors.loyaltyPoints = 'Loyalty points must be 0 or greater.';
    }
  }

  return errors;
}
