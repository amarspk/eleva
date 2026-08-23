'use client';

import React, { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Badge, Button, EmptyState, ErrorBanner, LoadingRow } from '../ui/Primitives';
import { ApiError } from '../../lib/api-client';
import { invoicesApi, type Invoice } from '../../lib/resources';

/** AUDIT-010 — list, view, and resend generated invoices. */

export function InvoiceManager(): React.ReactElement {
  const [notice, setNotice] = useState('');
  const listQuery = useQuery({ queryKey: ['invoices'], queryFn: () => invoicesApi.list() });

  const resendMutation = useMutation({
    mutationFn: (id: string) => invoicesApi.resend(id),
    onSuccess: (result) => {
      setNotice(`Invoice resent to ${result.to}${result.mocked ? ' (mock delivery)' : ''}.`);
    },
    onError: () => {
      setNotice('');
    },
  });

  const rows = useMemo(() => listQuery.data ?? [], [listQuery.data]);
  const listError = listQuery.error as ApiError | null;

  const openPdf = (row: Invoice): void => {
    if (row.pdfUrl) {
      window.open(row.pdfUrl, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <section aria-labelledby="invoices-heading">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 id="invoices-heading" className="text-lg font-bold text-gray-900">Invoices</h2>
      </div>
      {listError ? <ErrorBanner message={listError.message} /> : null}
      {resendMutation.error ? <ErrorBanner message={(resendMutation.error as Error).message} /> : null}
      {notice ? <p className="mb-3 text-sm text-green-700">{notice}</p> : null}
      {listQuery.isLoading ? (
        <LoadingRow label="Loading invoices…" />
      ) : rows.length === 0 ? (
        <EmptyState message="No invoices yet. Completing an order generates a PDF invoice." />
      ) : (
        <div className="overflow-x-auto rounded border border-gray-200 bg-white">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Invoices</caption>
            <thead className="bg-gray-50 text-[11px] uppercase tracking-wide text-gray-500">
              <tr>
                <th scope="col" className="px-3 py-2">Number</th>
                <th scope="col" className="px-3 py-2">Order</th>
                <th scope="col" className="px-3 py-2">Issued</th>
                <th scope="col" className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((row) => (
                <tr key={row.id} data-testid={`invoice-row-${row.id}`}>
                  <td className="px-3 py-2 font-medium text-gray-900">{row.invoiceNumber}</td>
                  <td className="px-3 py-2 font-mono text-xs text-gray-600">{row.orderId}</td>
                  <td className="px-3 py-2 text-gray-600">{row.createdAt}</td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end gap-1">
                      {row.pdfUrl ? (
                        <Button onClick={() => openPdf(row)}>View PDF</Button>
                      ) : (
                        <Badge tone="warning">No PDF</Badge>
                      )}
                      <Button
                        variant="primary"
                        disabled={resendMutation.isPending}
                        onClick={() => resendMutation.mutate(row.id)}
                      >
                        Resend
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
