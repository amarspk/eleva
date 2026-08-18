/**
 * Print helpers (Phase 4 P3).
 *
 * The receipt pages render into a dedicated print window/tab and call
 * `window.print()`. These styles make the output printer-safe: thermal
 * width, no background colors (save ink), reliable page breaks.
 */
export const PRINT_STYLES = `
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  html, body { margin: 0; padding: 0; background: #fff; }
  body { width: 302px; margin: 0 auto; }
  @page { size: 80mm auto; margin: 0; }
  @media print {
    html, body { width: 80mm; }
    .no-print { display: none !important; }
    .receipt-sheet, .kitchen-sheet { box-shadow: none; }
  }
  @media screen {
    body { padding: 16px 0; }
    .receipt-sheet, .kitchen-sheet { box-shadow: 0 1px 6px rgba(0,0,0,0.15); }
  }
`;
