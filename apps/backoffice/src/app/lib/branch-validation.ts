/**
 * Client-side validation for the Branches form (AUDIT-014 Phase 2).
 *
 * Lives in `lib/` as a plain `.ts` module so BOTH Jest runners can import it.
 *
 * Mirrors `CreateBranchRequestDto` / `UpdateBranchRequestDto`:
 *   name           2–100 chars
 *   address        required
 *   phoneNumber    required
 *   operatingHours required object
 *   latitude/longitude optional with range
 * The server remains authoritative; this only avoids a round-trip.
 */

export interface BranchFormState {
  restaurantId: string;
  name: string;
  address: string;
  phoneNumber: string;
  operatingHours: string; // JSON string for form
  latitude: string;
  longitude: string;
  isActive: boolean;
}

export const EMPTY_BRANCH_FORM: BranchFormState = {
  restaurantId: '',
  name: '',
  address: '',
  phoneNumber: '',
  operatingHours: '{}',
  latitude: '',
  longitude: '',
  isActive: true,
};

export function validateBranchForm(
  form: BranchFormState,
  mode: 'create' | 'edit',
): Record<string, string> {
  const errors: Record<string, string> = {};

  if (mode === 'create' && !form.restaurantId) {
    errors.restaurantId = 'Choose a restaurant.';
  }

  const name = form.name.trim();
  if (name.length < 2 || name.length > 100) {
    errors.name = 'Name must be 2–100 characters.';
  }

  if (!form.address.trim()) {
    errors.address = 'Address is required.';
  }

  if (!form.phoneNumber.trim()) {
    errors.phoneNumber = 'Phone number is required.';
  }

  if (!form.operatingHours.trim()) {
    errors.operatingHours = 'Operating hours are required.';
  } else {
    try {
      JSON.parse(form.operatingHours);
    } catch {
      errors.operatingHours = 'Operating hours must be valid JSON.';
    }
  }

  if (form.latitude.trim() !== '') {
    const lat = Number(form.latitude);
    if (Number.isNaN(lat) || lat < -90 || lat > 90) {
      errors.latitude = 'Latitude must be between -90 and 90.';
    }
  }

  if (form.longitude.trim() !== '') {
    const lng = Number(form.longitude);
    if (Number.isNaN(lng) || lng < -180 || lng > 180) {
      errors.longitude = 'Longitude must be between -180 and 180.';
    }
  }

  return errors;
}

/** Formats operating hours for display (simple). */
export function formatOperatingHours(value: Record<string, unknown> | string): string {
  if (typeof value === 'string') {
    try {
      return JSON.stringify(JSON.parse(value));
    } catch {
      return value;
    }
  }
  return JSON.stringify(value);
}
