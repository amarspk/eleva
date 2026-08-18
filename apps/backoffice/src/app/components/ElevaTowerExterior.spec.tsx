import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { ElevaTowerExterior } from './ElevaTowerExterior';

describe('ElevaTowerExterior (ELEVA Tower — exterior view)', () => {
  const baseProps = {
    env: { time: 'day' as const, weather: 'sunny' as const },
    isRtl: false,
    prefersReducedMotion: false,
    onSignIn: jest.fn(),
    onExplore: jest.fn(),
    onToggleLanguage: jest.fn(),
  };

  it('renders the ELEVA brand identity', () => {
    render(<ElevaTowerExterior {...baseProps} />);
    expect(screen.getAllByText('ELEVA').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole('heading', { name: 'ELEVA' })).toBeInTheDocument();
    expect(screen.getByText('Premium Restaurant SaaS Platform')).toBeInTheDocument();
  });

  it('shows the environment info (time + weather + language toggle)', () => {
    render(<ElevaTowerExterior {...baseProps} />);
    expect(screen.getByText('Clear skies')).toBeInTheDocument();
    fireEvent.click(screen.getByText('العربية'));
    expect(baseProps.onToggleLanguage).toHaveBeenCalled();
  });

  it('calls onSignIn when the sign-in CTA is clicked', () => {
    render(<ElevaTowerExterior {...baseProps} />);
    fireEvent.click(screen.getByText(/Sign In/));
    expect(baseProps.onSignIn).toHaveBeenCalled();
  });

  it('calls onExplore when the explore CTA is clicked', () => {
    render(<ElevaTowerExterior {...baseProps} />);
    fireEvent.click(screen.getByText('Explore Reception'));
    expect(baseProps.onExplore).toHaveBeenCalled();
  });

  it('reflects weather state in the copy', () => {
    render(<ElevaTowerExterior {...baseProps} env={{ time: 'night', weather: 'rainy' }} />);
    expect(screen.getByText('Rainy')).toBeInTheDocument();
  });

  it('reflects RTL in the language button label', () => {
    render(<ElevaTowerExterior {...baseProps} isRtl />);
    expect(screen.getByText('English')).toBeInTheDocument();
  });
});