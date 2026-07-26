import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { RestaurantCreationWizard } from './RestaurantCreationWizard';

beforeEach(() => {
  (global.fetch as jest.Mock).mockReset();
  (global.fetch as jest.Mock).mockResolvedValue({
    ok: true,
    json: async () => [
      {
        id: 'plan_starter',
        name: 'Starter',
        priceMonthly: 29,
        priceYearly: 290,
        maxBranches: 1,
        maxRestaurants: 1,
        maxProductsPerBranch: 100,
        allowCustomDomains: false,
        allowOnlinePayments: false,
        allowAnalytics: false,
      },
      {
        id: 'plan_pro',
        name: 'Professional',
        priceMonthly: 79,
        priceYearly: 790,
        maxBranches: 5,
        maxRestaurants: 3,
        maxProductsPerBranch: 500,
        allowCustomDomains: true,
        allowOnlinePayments: true,
        allowAnalytics: true,
      },
    ],
  });
  window.localStorage.getItem.mockReturnValue(null);
});

const fillCompanyStep = (): void => {
  fireEvent.change(screen.getByPlaceholderText(/Gourmet Burger/), { target: { value: 'Test Restaurant' } });
  fireEvent.change(screen.getByPlaceholderText('your-restaurant'), { target: { value: 'test-rest' } });
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
};

const fillAccountStep = (): void => {
  const firstNameInputs = screen.getAllByRole('textbox');
  fireEvent.change(firstNameInputs[0], { target: { value: 'John' } });
  fireEvent.change(firstNameInputs[1], { target: { value: 'Doe' } });
  fireEvent.change(screen.getByPlaceholderText('owner@restaurant.com'), { target: { value: 'own@test.com' } });
  fireEvent.change(screen.getByPlaceholderText(/Minimum 8/), { target: { value: 'password123' } });
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
};

const selectPlan = async (): Promise<void> => {
  await waitFor(() => {
    expect(screen.getByText('Starter')).toBeTruthy();
  });
  fireEvent.click(screen.getByText('Starter'));
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
};

const fillRestaurantStep = (): void => {
  fireEvent.change(screen.getByPlaceholderText('Full street address'), { target: { value: '123 Main St, Kuwait City' } });
  fireEvent.change(screen.getByPlaceholderText('+15550123456'), { target: { value: '+96512345678' } });
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
};

it('renders step 1 company form by default', () => {
  render(<RestaurantCreationWizard />);
  expect(screen.getByText('Create Your Restaurant')).toBeTruthy();
  expect(screen.getByText('Company Information')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Next' })).toBeTruthy();
});

it('validates company fields before advancing', () => {
  render(<RestaurantCreationWizard />);
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  const errors = screen.getAllByText(/at least 2 characters/);
  expect(errors.length).toBeGreaterThanOrEqual(2);
});

it('advances to step 2 after filling company info', () => {
  render(<RestaurantCreationWizard />);
  fillCompanyStep();
  expect(screen.getByText('Owner Account')).toBeTruthy();
});

it('validates owner fields on step 2', () => {
  render(<RestaurantCreationWizard />);
  fillCompanyStep();
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  const errors = screen.getAllByText(/at least 2 characters/);
  expect(errors.length).toBeGreaterThanOrEqual(2);
});

it('advances through all steps and renders review', async () => {
  render(<RestaurantCreationWizard />);

  fillCompanyStep();
  fillAccountStep();
  await selectPlan();
  fillRestaurantStep();

  expect(screen.getByText('Review & Confirm')).toBeTruthy();
  expect(screen.getAllByText('Test Restaurant').length).toBeGreaterThanOrEqual(2);
  expect(screen.getByText('test-rest.zayjar.com')).toBeTruthy();
  expect(screen.getByText('John Doe')).toBeTruthy();
  expect(screen.getByText('own@test.com')).toBeTruthy();
});

it('allows navigating back to previous steps', () => {
  render(<RestaurantCreationWizard />);
  fillCompanyStep();
  expect(screen.getByText('Owner Account')).toBeTruthy();

  fireEvent.click(screen.getByRole('button', { name: 'Back' }));
  expect(screen.getByText('Company Information')).toBeTruthy();
});

it('submits on final step and shows success', async () => {
  (global.fetch as jest.Mock)
    .mockResolvedValueOnce({
      ok: true,
      json: async () => [
        { id: 'plan_starter', name: 'Starter', priceMonthly: 29, priceYearly: 290, maxBranches: 1, maxRestaurants: 1, maxProductsPerBranch: 100, allowCustomDomains: false, allowOnlinePayments: false, allowAnalytics: false },
      ],
    })
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        tenant: { id: 't-1', name: 'Test', subdomain: 'test-rest', status: 'ACTIVE' },
        owner: { id: 'u-1', email: 'own@test.com' },
        restaurant: { id: 'r-1', name: 'Test Restaurant', currency: 'USD', timezone: 'UTC' },
        branch: { id: 'b-1', name: 'Main Branch' },
      }),
    })
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ accessToken: 'jwt-token-123', tenantId: 't-1' }),
    });

  render(<RestaurantCreationWizard />);

  fillCompanyStep();
  fillAccountStep();
  await selectPlan();
  fillRestaurantStep();

  fireEvent.click(screen.getByRole('button', { name: 'Create Restaurant' }));

  await waitFor(() => {
    expect(screen.getByText('Restaurant Created!')).toBeTruthy();
  });

  expect(screen.getByText('Test Restaurant')).toBeTruthy();
  expect(screen.getByText('test-rest.zayjar.com')).toBeTruthy();

  const postCall = (global.fetch as jest.Mock).mock.calls.find(
    (call: unknown[]) => call[1]?.method === 'POST',
  );
  expect(postCall).toBeTruthy();
  expect(postCall[0]).toContain('/api/v1/tenants');

  const loginCall = (global.fetch as jest.Mock).mock.calls.find(
    (call: unknown[]) => typeof call[0] === 'string' && call[0].includes('/auth/login'),
  );
  expect(loginCall).toBeTruthy();
  expect(window.localStorage.setItem).toHaveBeenCalledWith('accessToken', 'jwt-token-123');
  expect(window.localStorage.setItem).toHaveBeenCalledWith('tenantId', 't-1');
});

it('shows API error on submit failure', async () => {
  (global.fetch as jest.Mock)
    .mockResolvedValueOnce({
      ok: true,
      json: async () => [
        { id: 'plan_starter', name: 'Starter', priceMonthly: 29, priceYearly: 290, maxBranches: 1, maxRestaurants: 1, maxProductsPerBranch: 100, allowCustomDomains: false, allowOnlinePayments: false, allowAnalytics: false },
      ],
    })
    .mockResolvedValueOnce({
      ok: false,
      status: 409,
      json: async () => ({ message: 'Subdomain already taken' }),
    });

  render(<RestaurantCreationWizard />);

  fillCompanyStep();
  fillAccountStep();
  await selectPlan();
  fillRestaurantStep();

  fireEvent.click(screen.getByRole('button', { name: 'Create Restaurant' }));

  await waitFor(() => {
    expect(screen.getByText('Subdomain already taken')).toBeTruthy();
  });
});

it('auto-generates subdomain from company name', () => {
  render(<RestaurantCreationWizard />);
  fireEvent.change(screen.getByPlaceholderText(/Gourmet Burger/), { target: { value: 'My Great Cafe!' } });
  expect((screen.getByPlaceholderText('your-restaurant') as HTMLInputElement).value).toBe('my-great-cafe');
});

it('validates plan selection on step 3', async () => {
  render(<RestaurantCreationWizard />);

  fillCompanyStep();
  fillAccountStep();

  await waitFor(() => {
    expect(screen.getByText('Starter')).toBeTruthy();
  });

  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  expect(screen.getByText('Please select a subscription plan.')).toBeTruthy();
});
