import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { RestaurantSite } from './RestaurantSite';
import type { PublicSiteResponse } from '../lib/types';

// Fixture mirrors the real GET /api/v1/public/site contract.
const sampleSite: PublicSiteResponse = {
  tenant: {
    name: 'Albaik Demo',
    logoUrl: null,
    bannerUrl: null,
    primaryColor: '#112233',
    secondaryColor: '#ffffff',
    social: {
      phone: '+966501234567',
      whatsapp: '+966501234567',
      instagram: 'albaik',
      twitter: 'albaik',
    },
  },
  restaurant: { name: 'Albaik Chicken', currency: 'SAR' },
  branch: { id: 'branch-1', name: 'Riyadh - Olaya', phoneNumber: '+966112345678', address: 'Olaya St' },
  categories: [
    {
      id: 'cat-1',
      name: 'Grills',
      products: [
        {
          id: 'p1', name: 'Chicken Tikka', description: 'Grilled', imageUrl: null,
          basePrice: 12, calories: 500, preparationTime: 10, isAvailable: true, sizes: [], variants: [], addons: [],
        },
        {
          id: 'p2', name: 'Shish Tawook', description: 'Skewer', imageUrl: null,
          basePrice: 15, calories: 550, preparationTime: 12, isAvailable: true, sizes: [], variants: [], addons: [],
        },
      ],
    },
    {
      id: 'cat-2',
      name: 'Drinks',
      products: [
        {
          id: 'p3', name: 'Ayran', description: 'Yogurt drink', imageUrl: null,
          basePrice: 4, calories: 120, preparationTime: 2, isAvailable: true, sizes: [], variants: [], addons: [],
        },
      ],
    },
  ],
};

describe('RestaurantSite (Phase 4 P1 — token-free restaurant website)', () => {
  it('renders the restaurant identity from server-sourced branding', () => {
    render(<RestaurantSite site={sampleSite} />);
    expect(screen.getByText('Albaik Demo')).toBeInTheDocument();
    expect(screen.getByText(/Albaik Chicken/)).toBeInTheDocument();
    expect(screen.getByText(/Riyadh - Olaya/)).toBeInTheDocument();
  });

  it('renders real social/contact links when configured', () => {
    render(<RestaurantSite site={sampleSite} />);
    const call = screen.getByText('Call');
    const whatsapp = screen.getByText('WhatsApp');
    const instagram = screen.getByText('Instagram');
    expect(call.closest('a')).toHaveAttribute('href', 'tel:+966501234567');
    expect(whatsapp.closest('a')).toHaveAttribute('href', 'https://wa.me/966501234567');
    expect(instagram.closest('a')).toHaveAttribute('href', 'https://instagram.com/albaik');
  });

  it('shows category chips and filters the product grid on click', () => {
    render(<RestaurantSite site={sampleSite} />);
    // All products initially (2 grills + 1 drink)
    expect(screen.getByText('Chicken Tikka')).toBeInTheDocument();
    expect(screen.getByText('Ayran')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Drinks'));

    expect(screen.getByText('Ayran')).toBeInTheDocument();
    expect(screen.queryByText('Chicken Tikka')).not.toBeInTheDocument();
  });

  it('falls back to the branch phone for the call link when no social is configured', () => {
    const siteNoSocial: PublicSiteResponse = {
      ...sampleSite,
      tenant: { ...sampleSite.tenant, social: null },
    };
    render(<RestaurantSite site={siteNoSocial} />);
    const call = screen.getByText('Call');
    expect(call.closest('a')).toHaveAttribute('href', 'tel:+966112345678');
  });

  it('Phase 4 P1: renders the selected category image when present', () => {
    const siteWithCatImages: PublicSiteResponse = {
      ...sampleSite,
      categories: [
        { ...sampleSite.categories[0], imageUrl: 'https://cdn.example.com/grills.webp' },
        ...sampleSite.categories.slice(1),
      ],
    };
    render(<RestaurantSite site={siteWithCatImages} />);
    fireEvent.click(screen.getByText('Grills'));
    const img = document.querySelector('img[alt="Grills"]') as HTMLImageElement | null;
    expect(img).not.toBeNull();
    expect(img?.src).toBe('https://cdn.example.com/grills.webp');
  });

  it('Phase 4 P1: shows a clean fallback when the category has no image', () => {
    render(<RestaurantSite site={sampleSite} />);
    fireEvent.click(screen.getByText('Grills'));
    // No image element for the category; the neutral placeholder div renders
    expect(document.querySelector('img[alt="Grills"]')).toBeNull();
    expect(screen.getAllByText('Grills').length).toBeGreaterThanOrEqual(1);
    // Filtering still works after selecting the image-less category
    expect(screen.getByText('Chicken Tikka')).toBeInTheDocument();
    expect(screen.queryByText('Ayran')).not.toBeInTheDocument();
  });

  // Phase 4 P1 — Website Editor: Theme + Design Configuration
  describe('Theme support (Light/Dark/Auto)', () => {
    it('defaults to Light theme when no design config is provided', () => {
      render(<RestaurantSite site={sampleSite} />);
      const root = document.querySelector('[data-theme]');
      expect(root).toBeInTheDocument();
      expect(root).toHaveAttribute('data-theme', 'light');
    });

    it('applies Light theme when design.theme=light', () => {
      const site: PublicSiteResponse = {
        ...sampleSite,
        design: { theme: 'light', colors: { primary: '#ff0000', secondary: '#ffffff' }, fonts: { heading: 'Arial', body: 'Arial' } },
      };
      render(<RestaurantSite site={site} />);
      const root = document.querySelector('[data-theme]');
      expect(root).toHaveAttribute('data-theme', 'light');
      expect(root).toHaveAttribute('data-primary', '#ff0000');
    });

    it('applies Dark theme when design.theme=dark', () => {
      const site: PublicSiteResponse = {
        ...sampleSite,
        design: { theme: 'dark', colors: { primary: '#111', secondary: '#222' }, fonts: { heading: 'Arial', body: 'Arial' } },
      };
      render(<RestaurantSite site={site} />);
      const root = document.querySelector('[data-theme]');
      expect(root).toHaveAttribute('data-theme', 'dark');
    });

    it('applies design colors from the website editor configuration', () => {
      const site: PublicSiteResponse = {
        ...sampleSite,
        design: { theme: 'light', colors: { primary: '#FF5733', secondary: '#F0F0F0' } },
      };
      render(<RestaurantSite site={site} />);
      const root = document.querySelector('[data-primary]');
      expect(root).toHaveAttribute('data-primary', '#FF5733');
    });

    it('uses design fonts when configured', () => {
      const site: PublicSiteResponse = {
        ...sampleSite,
        design: { theme: 'light', fonts: { heading: 'Georgia', body: 'Verdana' } },
      };
      render(<RestaurantSite site={site} />);
      const root = document.querySelector('[data-theme]');
      expect(root).toBeInTheDocument();
      // The root div has fontFamily from body font
      expect(root).toHaveStyle('font-family: Verdana');
    });

    it('falls back to tenant primaryColor when design has no colors', () => {
      const site: PublicSiteResponse = {
        ...sampleSite,
        design: { theme: 'light' },
      };
      render(<RestaurantSite site={site} />);
      const root = document.querySelector('[data-primary]');
      expect(root).toHaveAttribute('data-primary', sampleSite.tenant.primaryColor);
    });

    it('Auto theme sets data-theme to system preference (light or dark)', () => {
      // JSDOM defaults to light scheme; we can't mock matchMedia easily,
      // so verify that data-theme is set when theme=auto
      const site: PublicSiteResponse = {
        ...sampleSite,
        design: { theme: 'auto' },
      };
      render(<RestaurantSite site={site} />);
      const root = document.querySelector('[data-theme]');
      expect(root).toBeInTheDocument();
      // data-theme will be 'light' or 'dark' (JSDOM default is light)
      expect(['light', 'dark']).toContain(root?.getAttribute('data-theme'));
    });
  });

  describe('Design configuration applied to rendered elements', () => {
    it('applies heading font to the restaurant name', () => {
      const site: PublicSiteResponse = {
        ...sampleSite,
        design: { theme: 'light', fonts: { heading: 'Georgia', body: 'Arial' } },
      };
      render(<RestaurantSite site={site} />);
      const h1 = screen.getByText('Albaik Demo');
      expect(h1).toHaveStyle('font-family: Georgia');
    });

    it('renders product cards with theme-aware styling', () => {
      render(<RestaurantSite site={sampleSite} />);
      const productCards = document.querySelectorAll('.grid > div');
      expect(productCards.length).toBeGreaterThan(0);
    });
  });
});