'use client';
/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-function-return-type, curly, no-console, @typescript-eslint/no-unused-vars */

import React, { useEffect, useState } from 'react';
import io from 'socket.io-client';

interface OrderItem {
  id: string;
  name: string;
  quantity: number;
  size: string | null;
  addons: string[];
  cookingStatus: 'PENDING' | 'PREPARING' | 'COOKED' | 'SERVED';
}

interface KDSTicket {
  ticketId: string;
  ticketNumber: string;
  priority: 'LOW' | 'NORMAL' | 'RUSH';
  elapsedMinutes: number;
  items: OrderItem[];
}

interface KDSTerminalProps {
  branchId: string;
  accessToken: string;
  tenantId?: string;
}

export const KDSTerminal: React.FC<KDSTerminalProps> = ({ branchId, accessToken, tenantId }) => {
  const [tickets, setTickets] = useState<KDSTicket[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [filterStatus, setFilterStatus] = useState<'ALL' | 'PENDING' | 'PREPARING' | 'COOKED'>('ALL');

  useEffect(() => {
    // Resolve tenant context from props or subdomain per DOC-005 4.2 and DOC-006 tenant isolation
    const tenant = tenantId || 'unknown-tenant';
    console.log(`KDS Terminal initializing for tenant [${tenant}] branch [${branchId}]`);

    // Handshake initialization with secure credentials validation per DOC-008 7.6
    const socketUrl = process.env.NEXT_PUBLIC_SOCKET_SERVER_URL || 'http://localhost:8000';
    const socket = io(`${socketUrl}/kds`, {
      auth: { token: accessToken },
      query: { branchId },
      transports: ['websocket', 'polling'],
    });

    socket.on('connect', () => {
      console.log('KDS WebSocket established successfully.');
      setIsConnected(true);
      // Join branch-specific room scoped to tenant:branch per DOC-008 7.6
      socket.emit('joinBranch', { branchId });
    });

    socket.on('disconnect', () => {
      setIsConnected(false);
    });

    socket.on('connected', (data: any) => {
      console.log(`KDS authenticated for tenant ${data.tenantId}`, data);
    });

    // Handle new incoming tickets per DOC-005 4.5 KDS Queue Management
    socket.on('ticket.created', (newTicket: KDSTicket) => {
      setTickets((prevTickets) => [...prevTickets, { ...newTicket, elapsedMinutes: 0 }]);
    });

    // Server-side priority escalation event
    socket.on('ticket.priority_changed', (payload: { data: { ticketId: string; oldPriority: string; newPriority: string } }) => {
      const data = payload.data || payload;
      setTickets((prevTickets) =>
        prevTickets.map((ticket) =>
          ticket.ticketId === data.ticketId
            ? { ...ticket, priority: data.newPriority as KDSTicket['priority'] }
            : ticket
        )
      );
    });

    // Legacy alias: order.created for backward compatibility
    socket.on('order.created', (payload: any) => {
      // Transform order.created event to KDS ticket format per DOC-008 7.6 Event Broadcasts
      const order = payload.data || payload;
      const ticket: KDSTicket = {
        ticketId: order.id || `ticket-${Date.now()}`,
        ticketNumber: order.orderNumber ? order.orderNumber.slice(-3) : `${Math.floor(Math.random() * 900) + 100}`,
        priority: 'NORMAL',
        elapsedMinutes: 0,
        items: (order.orderItems || []).map((item: any) => ({
          id: item.id,
          name: item.product?.name || item.name || 'Unknown Item',
          quantity: item.quantity,
          size: item.size?.name || item.size || null,
          addons: item.orderItemAddons ? item.orderItemAddons.map((a: any) => a.addonItem?.name || a.name) : [],
          cookingStatus: item.cookingStatus || 'PENDING',
        })),
      };
      setTickets((prev) => [...prev, ticket]);
    });

    // Update active state mappings for cooking status
    socket.on('ticket.item_updated', (updatePayload: { orderItemId: string; status: 'PREPARING' | 'COOKED'; cookingStatus?: string }) => {
      setTickets((prevTickets) =>
        prevTickets.map((ticket) => ({
          ...ticket,
          items: ticket.items.map((item) =>
            item.id === updatePayload.orderItemId
              ? { ...item, cookingStatus: (updatePayload.cookingStatus as any) || updatePayload.status }
              : item
          ),
        }))
      );
    });

    socket.on('order.item_updated', (payload: any) => {
      const data = payload.data || payload;
      setTickets((prevTickets) =>
        prevTickets.map((ticket) => ({
          ...ticket,
          items: ticket.items.map((item) =>
            item.id === data.orderItemId ? { ...item, cookingStatus: data.cookingStatus || data.status } : item
          ),
        }))
      );
    });

    return () => {
      socket.disconnect();
    };
  }, [branchId, accessToken, tenantId]);

  const updateItemStatus = async (orderItemId: string, currentStatus: string) => {
    const nextStatus = currentStatus === 'PENDING' ? 'PREPARING' : currentStatus === 'PREPARING' ? 'COOKED' : 'SERVED';
    
    // Optimistic client mutation per Appendix C.2
    setTickets((prevTickets) =>
      prevTickets.map((ticket) => ({
        ...ticket,
        items: ticket.items.map((item) =>
          item.id === orderItemId ? { ...item, cookingStatus: nextStatus as any } : item
        ),
      }))
    );

    try {
      // Call KDS REST API to update cooking status per DOC-003 3.8.2
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      await fetch(`${apiUrl}/api/v1/kds/items/${orderItemId}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ status: nextStatus }),
      });
    } catch (err) {
      console.error(`Failed to update item status ${orderItemId}:`, err);
    }
  };

  const filteredTickets = tickets.filter((ticket) => {
    if (filterStatus === 'ALL') return true;
    return ticket.items.some((item) => item.cookingStatus === filterStatus);
  });

  return (
    <div className="w-full bg-slate-900 min-h-screen p-6 flex flex-col">
      <header className="flex justify-between items-center border-b border-slate-800 pb-4 mb-6">
        <h1 className="text-xl font-bold text-white">Active Production Board - Branch {branchId.slice(-4)}</h1>
        <div className="flex gap-4 items-center">
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as any)}
            className="bg-slate-800 text-white text-xs px-2 py-1 rounded"
          >
            <option value="ALL">All Tickets</option>
            <option value="PENDING">Pending</option>
            <option value="PREPARING">Preparing</option>
            <option value="COOKED">Cooked</option>
          </select>
          <span className="text-xs text-slate-400">{isConnected ? 'Connected' : 'Disconnected'}</span>
          <span className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'} self-center`}></span>
        </div>
      </header>

      <div className="mb-4 text-xs text-slate-500">
        Tenant isolated • Room: tenant:{tenantId || 'unknown'}:branch:{branchId} • {tickets.length} active tickets
      </div>

      {/* Grid of Kitchen Tickets per DOC-005 4.5 */}
      <main className="flex-1 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 items-start overflow-x-auto">
        {filteredTickets.length === 0 ? (
          <div className="col-span-full text-center text-slate-500 py-12">
            <p className="text-lg">No active tickets</p>
            <p className="text-xs mt-2">Waiting for new orders... KDS WebSocket tenant scoped room active</p>
          </div>
        ) : (
          filteredTickets.map((ticket) => (
            <div
              key={ticket.ticketId}
              className={`rounded-xl border shadow-xl flex flex-col max-h-[80vh] overflow-hidden ${
                ticket.priority === 'RUSH' ? 'border-red-500 bg-red-950/20' : 'border-slate-800 bg-slate-950'
              }`}
            >
              {/* Ticket Header card */}
              <div className="px-4 py-3 border-b border-slate-800 flex justify-between items-center">
                <span className="text-2xl font-black text-white">#{ticket.ticketNumber}</span>
                <div className="flex gap-2 items-center">
                  <span className="text-[10px] text-slate-400">{ticket.elapsedMinutes}m</span>
                  <span className={`text-[10px] px-2 py-1 rounded font-bold ${
                    ticket.priority === 'RUSH' ? 'bg-red-500 text-white animate-pulse' : 'bg-slate-800 text-slate-400'
                  }`}>
                    {ticket.priority}
                  </span>
                </div>
              </div>

              {/* Ticket Order items */}
              <div className="p-4 flex-1 overflow-y-auto space-y-4">
                {ticket.items.map((item) => (
                  <div key={item.id} className="border-b border-slate-800/50 pb-3 last:border-0">
                    <div className="flex justify-between">
                      <span className="text-sm font-bold text-slate-100">{item.quantity}x {item.name}</span>
                      <button
                        onClick={() => updateItemStatus(item.id, item.cookingStatus)}
                        className={`text-[10px] px-2 py-1 rounded font-bold transition-colors ${
                          item.cookingStatus === 'COOKED'
                            ? 'bg-green-500 text-white'
                            : item.cookingStatus === 'PREPARING'
                            ? 'bg-yellow-500 text-black'
                            : item.cookingStatus === 'SERVED'
                            ? 'bg-blue-500 text-white'
                            : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                        }`}
                      >
                        {item.cookingStatus}
                      </button>
                    </div>
                    {item.size && <p className="text-xs text-slate-400 mt-1">Size: {item.size}</p>}
                    {item.addons.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {item.addons.map((add, idx) => (
                          <span key={idx} className="bg-slate-800 text-slate-300 text-[10px] px-1.5 py-0.5 rounded">
                            +{add}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Footer with actions */}
              <div className="px-4 py-2 border-t border-slate-800 flex justify-between text-[10px] text-slate-500">
                <span>ID: {ticket.ticketId.slice(-6)}</span>
                <span>{ticket.items.length} items</span>
              </div>
            </div>
          ))
        )}
      </main>
    </div>
  );
};
