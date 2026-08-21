import React from 'react';
import type { ReceiptData, ReceiptItem } from './receipt-types';
import { getReceiptLabels } from './i18n';

/**
 * Kitchen ticket — a separate, kitchen-optimized print format.
 *
 * Shows the ticket number, order number, items (with sizes and add-ons) and
 * order notes. Deliberately omits prices, totals, payment method and other
 * customer-facing receipt information. Independently printable from the
 * customer receipt.
 */
export function KitchenTicket({ data }: { data: ReceiptData }): React.ReactElement {
  const { config, tenant, order } = data;
  const lang = config.language;
  const labels = getReceiptLabels(lang);
  const dir = lang === 'ar' ? 'rtl' : 'ltr';

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
      className="kitchen-sheet"
      style={{
        width: 302,
        maxWidth: '100%',
        margin: '0 auto',
        padding: '10px 10px',
        fontFamily: "'Courier New', 'Noto Sans Arabic', monospace",
        fontSize: 13,
        lineHeight: 1.5,
        color: '#111',
        background: '#fff',
        boxSizing: 'border-box',
      }}
    >
      <div style={{ textAlign: 'center', fontSize: 18, fontWeight: 700, letterSpacing: 2 }}>
        {tenant.name.toUpperCase()}
      </div>
      <div style={{ textAlign: 'center', fontSize: 14, fontWeight: 700, marginTop: 4 }}>
        {labels.ticket} #{order.orderNumber}
      </div>
      <div style={{ textAlign: 'center', fontSize: 11, color: '#444' }}>
        {new Date(order.createdAt).toLocaleTimeString(lang === 'ar' ? 'ar-EG' : 'en-US', {
          hour: '2-digit',
          minute: '2-digit',
        })}
      </div>

      <div style={{ borderTop: '2px solid #111', margin: '8px 0' }} />

      {order.items.map((item, idx) => {
        const sub = itemLines(item);
        return (
          <div key={`${item.name}-${idx}`} style={{ marginBottom: 6 }}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>
              {item.quantity} × {item.name}
            </div>
            {sub.map((s, i) => (
              <div key={i} style={{ fontSize: 12, color: '#333', paddingInlineStart: 14 }}>
                — {s}
              </div>
            ))}
          </div>
        );
      })}

      {order.specialNotes && (
        <>
          <div style={{ borderTop: '1px solid #999', margin: '8px 0' }} />
          <div style={{ fontSize: 12 }}>
            <span style={{ fontWeight: 700 }}>{labels.notes}: </span>
            {order.specialNotes}
          </div>
        </>
      )}

      <div style={{ borderTop: '2px solid #111', margin: '10px 0 4px' }} />
    </div>
  );
}

export default KitchenTicket;