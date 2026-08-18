import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { ElevaReception, RECEPTION_ZONES } from './ElevaReception';

describe('ElevaReception (ELEVA Tower — reception lobby)', () => {
  const baseProps = {
    activeZone: null,
    prefersReducedMotion: false,
    onSelectZone: jest.fn(),
    onBackToExterior: jest.fn(),
    isRtl: false,
    onToggleLanguage: jest.fn(),
  };

  it('renders every reception zone as a distinct architectural corner', () => {
    render(<ElevaReception {...baseProps} />);
    RECEPTION_ZONES.forEach(zone => {
      expect(screen.getAllByText(zone.title).length).toBeGreaterThanOrEqual(1);
    });
  });

  it('renders all zones with real content (not placeholders)', () => {
    render(<ElevaReception {...baseProps} />);
    RECEPTION_ZONES.forEach(zone => {
      expect(
        screen.getByText((content: string) => content.includes(zone.description.slice(0, 40)))
      ).toBeInTheDocument();
    });
  });

  it('navigates to a zone when its chip is clicked', () => {
    render(<ElevaReception {...baseProps} />);
    const pricingChip = screen.getAllByRole('button', { name: 'Pricing' })[0];
    fireEvent.click(pricingChip);
    expect(baseProps.onSelectZone).toHaveBeenCalledWith('pricing');
  });

  it('returns to the exterior when the back button is clicked', () => {
    render(<ElevaReception {...baseProps} />);
    fireEvent.click(screen.getByText(/Exterior/));
    expect(baseProps.onBackToExterior).toHaveBeenCalled();
  });

  it('toggles language from the reception header', () => {
    render(<ElevaReception {...baseProps} />);
    fireEvent.click(screen.getAllByText('العربية')[0]);
    expect(baseProps.onToggleLanguage).toHaveBeenCalled();
  });

  it('marks the active zone with aria-current', () => {
    render(<ElevaReception {...baseProps} activeZone="faq" />);
    const faqChip = screen.getAllByRole('button', { name: 'FAQ' })[0];
    expect(faqChip).toHaveAttribute('aria-current', 'true');
  });
});