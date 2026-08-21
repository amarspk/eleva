import React from 'react';
import type { ReceiptData, ReceiptItem } from './receipt-types';
import { getReceiptLabels, paymentMethodLabel } from './i18n';
import { formatMoney, formatDateTime } from './format';

/**
 * Customer receipt — thermal-print-friendly (80 mm ≈ 302 px).
 *
 * Uses the merchant's receipt configuration: field visibility toggles,
 * language (EN/AR → LTR/RTL), logo, and footer message. All styling is
 * inline/print-CSS driven (no framework classes) so the print window has no
 * dependency on the host app's Tailwind pipeline.
 */
export function CustomerReceipt({ data }: { data: ReceiptData }): React.ReactElement {
  const { config, tenant, branch, order } = data;
  const lang = config.language;
  const labels = getReceiptLabels(lang);
  const dir = lang === 'ar' ? 'rtl' : 'ltr';
  const currency = tenant.currency || 'USD';
  const primary = tenant.primaryColor || '#111111';
  const { date, time } = formatDateTime(order.createdAt, lang);

  const itemLines = (item: ReceiptItem): string[] => {
    const lines: string[] = [];
    if (item.size) {
      lines.push(item.size);
    }
    if (item.variant) {
      lines.push(item.variant);
    }
    if (item.addons && item.addons.length > 0) {
      lines.push(item.addons.join(' + '));
    }
    return lines;
  };

  return (
    <div
      dir={dir}
      className="receipt-sheet"
      style={{
        width: 302,
        maxWidth: '100%',
        margin: '0 auto',
        padding: '12px 10px',
        fontFamily: "'Courier New', 'Noto Sans Arabic', monospace",
        fontSize: 12,
        lineHeight: 1.45,
        color: '#111',
        background: '#fff',
        boxSizing: 'border-box',
      }}
    >
      {/* Header — logo + restaurant name */}
      <div style={{ textAlign: 'center', marginBottom: 8 }}>
        {config.showLogo && tenant.logoUrl && (
          <img
            src={tenant.logoUrl}
            alt={tenant.name}
            style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 4, margin: '0 auto 4px' }}
          />
        )}
        <div style={{ fontSize: 16, fontWeight: 700, color: primary }}>{tenant.name}</div>
        {config.showBranchInfo && (
          <div style={{ fontSize: 11, color: '#444' }}>
            <div>{branch.name}</div>
            {branch.address && <div>{branch.address}</div>}
            {branch.phoneNumber && <div>{labels.phone}: {branch.phoneNumber}</div>}
          </div>
        )}
      </div>

      <div style={{ borderTop: '1px dashed #999', margin: '6px 0' }} />

      {/* Order meta */}
      <div style={{ fontSize: 11, color: '#333' }}>
        {config.showOrderNumber && (
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>{labels.order} #{order.orderNumber}</span>
          </div>
        )}
        {config.showDateTime && (
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>{date}</span>
            <span>{time}</span>
          </div>
        )}
      </div>

      <div style={{ borderTop: '1px dashed #999', margin: '6px 0' }} />

      {/* Items */}
      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, marginBottom: 2 }}>
        <span>{labels.item}</span>
        <span>{labels.price}</span>
      </div>
      {order.items.map((item, idx) => {
        const sub = itemLines(item);
        return (
          <div key={`${item.name}-${idx}`} style={{ marginBottom: 4 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ maxWidth: '68%', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {item.quantity} × {item.name}
              </span>
              <span>{formatMoney(item.totalPrice, currency, lang)}</span>
            </div>
            {sub.map((s, i) => (
              <div key={i} style={{ fontSize: 10, color: '#666', paddingInlineStart: 12 }}>
                {s}
              </div>
            ))}
          </div>
        );
      })}

      <div style={{ borderTop: '1px dashed #999', margin: '6px 0' }} />

      {/* Totals */}
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span>{labels.subtotal}</span>
        <span>{formatMoney(order.subtotal, currency, lang)}</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span>{labels.tax}</span>
        <span>{formatMoney(order.taxAmount, currency, lang)}</span>
      </div>
      {config.showDiscounts && order.discountAmount > 0 && (
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>{labels.discount}</span>
          <span>-{formatMoney(order.discountAmount, currency, lang)}</span>
        </div>
      )}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontWeight: 700,
          fontSize: 14,
          borderTop: '1px solid #444',
          marginTop: 4,
          paddingTop: 4,
        }}
      >
        <span>{labels.total}</span>
        <span>{formatMoney(order.total, currency, lang)}</span>
      </div>

      {config.showPayment && (
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
          <span>{labels.payment}</span>
          <span>{paymentMethodLabel(order.paymentMethod, lang)}</span>
        </div>
      )}

      {config.showNotes && order.specialNotes && (
        <>
          <div style={{ borderTop: '1px dashed #999', margin: '6px 0' }} />
          <div style={{ fontSize: 11 }}>
            <div style={{ fontWeight: 700 }}>{labels.notes}:</div>
            <div style={{ color: '#444' }}>{order.specialNotes}</div>
          </div>
        </>
      )}

      {/* Footer */}
      <div style={{ borderTop: '1px dashed #999', margin: '6px 0' }} />
      <div style={{ textAlign: 'center', fontSize: 11, color: '#555' }}>
        {config.footerMessage}
      </div>
    </div>
  );
}

export default CustomerReceipt;
