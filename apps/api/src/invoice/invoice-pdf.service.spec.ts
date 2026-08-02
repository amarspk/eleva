import { InvoicePdfService, InvoicePdfData } from './invoice-pdf.service';
import * as zlib from 'zlib';

/**
 * Extracts the rendered text of a PDF: pdfkit compresses content streams
 * (FlateDecode) and encodes glyph runs as hex strings (`<...>` inside TJ/Tj
 * operators). This inflates every stream and decodes the hex runs so the
 * assertions see the actual visible text.
 */
function extractPdfText(pdf: Buffer): string {
  const raw = pdf.toString('latin1');
  const decoded: string[] = [];
  const streamRe = /stream\r?\n([\s\S]*?)endstream/g;
  let match: RegExpExecArray | null;
  while ((match = streamRe.exec(raw)) !== null) {
    try {
      const inflated = zlib
        .inflateSync(Buffer.from(match[1].replace(/\r?\n$/, ''), 'latin1'))
        .toString('latin1');
      const hexRe = /<([0-9a-fA-F]+)>/g;
      let hex: RegExpExecArray | null;
      while ((hex = hexRe.exec(inflated)) !== null) {
        const bytes = Buffer.from(hex[1], 'hex').toString('latin1');
        // Only printable runs are meaningful text; skip binary font data.
        if (/^[\x20-\x7e]+$/.test(bytes)) {
          decoded.push(bytes);
        }
      }
    } catch {
      // Non-compressed or partial stream — skip.
    }
  }
  return decoded.join('');
}

describe('InvoicePdfService', () => {
  let service: InvoicePdfService;

  beforeEach(() => {
    service = new InvoicePdfService();
  });

  const data: InvoicePdfData = {
    invoiceNumber: 'INV-2026-123456',
    orderNumber: 'ORD-2026-54321',
    companyName: 'Albaik Chicken',
    branchName: 'Riyadh - Olaya Branch',
    customerName: 'John Doe',
    subtotal: 100.0,
    taxAmount: 15.0,
    discountAmount: 5.0,
    total: 110.0,
    issuedAt: new Date('2026-07-31T12:00:00.000Z'),
  };

  it('renders a valid PDF buffer starting with the %PDF magic', async () => {
    const pdf = await service.generate(data);
    expect(pdf.length).toBeGreaterThan(200);
    expect(pdf.subarray(0, 5).toString('ascii')).toBe('%PDF-');
  });

  it('embeds the invoice number and monetary values in the content stream', async () => {
    const pdf = await service.generate(data);
    const text = extractPdfText(pdf);
    expect(text).toContain('INV-2026-123456');
    expect(text).toContain('ORD-2026-54321');
    expect(text).toContain('Albaik Chicken');
    expect(text).toContain('$110.00');
  });

  it('renders content-deterministically for the same input (idempotent rendering)', async () => {
    const a = await service.generate(data);
    const b = await service.generate(data);
    expect(a.length).toBeGreaterThan(200);
    expect(extractPdfText(a)).toBe(extractPdfText(b));
  });
});
