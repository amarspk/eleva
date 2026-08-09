import { Injectable } from '@nestjs/common';
// pdfkit is a CommonJS module; the default export is the PDFDocument class.
// eslint-disable-next-line @typescript-eslint/no-require-imports
import PDFDocument = require('pdfkit');

export interface InvoicePdfData {
  invoiceNumber: string;
  orderNumber: string;
  companyName: string;
  branchName: string;
  customerName: string;
  subtotal: number;
  taxAmount: number;
  discountAmount: number;
  total: number;
  issuedAt: Date;
}

/**
 * Real invoice PDF generation (Sprint 2 Task 5).
 *
 * Replaces the fabricated `pdfUrl = https://cdn.zayjar.com/invoices/...` string
 * (order.service.ts) with an actual PDF document rendered by pdfkit. The
 * generated Buffer is stored by the caller (InvoiceStorageService) and the
 * resulting public URL is persisted on the Invoice record — so invoice
 * downloads now serve a real, human-readable PDF.
 *
 * The service is pure: it renders and returns a Buffer; no I/O, no storage.
 */
@Injectable()
export class InvoicePdfService {
  /**
   * Renders a single-page A4 invoice and returns the PDF bytes.
   * Uses a monospace fallback font bundled with pdfkit (no external font
   * assets needed), so generation is fully self-contained and deterministic.
   */
  generate(data: InvoicePdfData): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 48, bufferPages: false });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Header
      doc.fontSize(18).fillColor('#1f2937').text(data.companyName, { continued: false });
      doc.moveDown(0.2);
      doc.fontSize(11).fillColor('#6b7280').text('INVOICE');
      doc.moveDown(0.6);

      // Meta block
      doc.fontSize(10).fillColor('#374151');
      doc.text(`Invoice: ${data.invoiceNumber}`);
      doc.text(`Order: ${data.orderNumber}`);
      doc.text(`Branch: ${data.branchName}`);
      doc.text(`Customer: ${data.customerName}`);
      doc.text(`Issued: ${data.issuedAt.toISOString()}`);
      doc.moveDown(1);

      // Totals
      const money = (value: number): string => `$${value.toFixed(2)}`;
      const lines: Array<[string, string]> = [
        ['Subtotal', money(data.subtotal)],
        ['Tax', money(data.taxAmount)],
        ['Discount', `-${money(data.discountAmount)}`],
        ['Total', money(data.total)],
      ];
      for (const [label, value] of lines) {
        doc.font('Helvetica-Bold').text(`${label}:`, { width: 200 });
        doc.font('Helvetica').text(value, { align: 'right', width: 400 });
        doc.moveDown(0.25);
      }

      doc.moveDown(1);
      doc
        .fontSize(8)
        .fillColor('#9ca3af')
        .text('Thank you for dining with us. This invoice was generated electronically by Eleva.', {
          align: 'center',
        });

      doc.end();
    });
  }
}
