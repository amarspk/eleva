import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ElevaTower } from './ElevaTower';

const mockReplace = jest.fn();
const mockPush = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
}));

/* No stored session → tower shown */
const mockLoadSession = jest.fn();
jest.mock('../lib/auth', () => ({
  loadSession: () => mockLoadSession(),
}));

describe('ElevaTower (ELEVA Tower — brand & marketing platform)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLoadSession.mockReturnValue(null);
  });

  it('shows the exterior as the first view', () => {
    render(<ElevaTower />);
    expect(screen.getByRole('heading', { name: 'ELEVA' })).toBeInTheDocument();
    expect(screen.getByText('Premium Restaurant SaaS Platform')).toBeInTheDocument();
  });

  it('routes already-authenticated users straight to the office (skip tower UI)', async () => {
    mockLoadSession.mockReturnValue({ accessToken: 'token-1' });
    render(<ElevaTower />);
    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/');
    });
  });

  it('enters the reception when the visitor chooses to explore', () => {
    render(<ElevaTower />);
    fireEvent.click(screen.getByText('Explore Reception'));
    expect(screen.getAllByText('About ELEVA').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('What we do').length).toBeGreaterThanOrEqual(1);
  });

  it('sends the visitor to the elevator login on Sign In', () => {
    render(<ElevaTower />);
    fireEvent.click(screen.getByText(/Sign In/));
    expect(mockPush).toHaveBeenCalledWith('/login?tower=true');
  });

  it('toggles between English and Arabic', () => {
    render(<ElevaTower />);
    const toggle = screen.getByText('العربية');
    fireEvent.click(toggle);
    expect(screen.getByText('English')).toBeInTheDocument();
  });
});