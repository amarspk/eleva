import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { prisma } from '@zayjar/db';

const VALID_TRANSITIONS: Record<string, string[]> = {
  NEW: ['REVIEWING', 'CLOSED'],
  REVIEWING: ['RESOLVED', 'NEW', 'CLOSED'],
  RESOLVED: ['CLOSED', 'REVIEWING'],
  CLOSED: ['REVIEWING'],
};

@Injectable()
export class ComplaintService {
  private readonly logger = new Logger(ComplaintService.name);

  private assertStatusTransition(current: string, next: string): void {
    const allowed = VALID_TRANSITIONS[current];
    if (!allowed || !allowed.includes(next)) {
      throw new BadRequestException(`Cannot transition complaint from ${current} to ${next}.`);
    }
  }

  /** Customer: create a complaint optionally linked to a verified order. */
  async create(
    customerId: string, tenantId: string,
    data: { subject: string; description: string; orderId?: string },
  ): Promise<Record<string, unknown>> {
    if (data.orderId) {
      const order = await prisma.order.findUnique({ where: { id: data.orderId } });
      // findUnique is not ALS-scoped; require owner AND this tenant.
      if (!order || order.customerId !== customerId || order.tenantId !== tenantId) {
        throw new NotFoundException('Order not found.');
      }
    }
    const complaint = await prisma.customerComplaint.create({
      data: {
        tenantId, customerId,
        subject: data.subject, description: data.description,
        orderId: data.orderId || null,
        status: 'NEW',
      },
    });
    return { id: complaint.id, subject: complaint.subject, description: complaint.description, status: complaint.status, createdAt: complaint.createdAt.toISOString(), orderId: complaint.orderId };
  }

  /** Customer: list own complaints (tenant-scoped by extension). */
  async listMy(customerId: string): Promise<Array<Record<string, unknown>>> {
    const complaints = await prisma.customerComplaint.findMany({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return complaints.map(c => ({
      id: c.id, subject: c.subject, status: c.status, createdAt: c.createdAt.toISOString(),
      messageCount: 0, // filled by caller if needed
    }));
  }

  /** Customer: get one complaint (own only). */
  async getMy(customerId: string, complaintId: string): Promise<Record<string, unknown>> {
    const complaint = await prisma.customerComplaint.findUnique({ where: { id: complaintId } });
    if (!complaint || complaint.customerId !== customerId) {
      throw new NotFoundException('Complaint not found.');
    }
    const messages = await prisma.complaintMessage.findMany({
      where: { complaintId }, orderBy: { createdAt: 'asc' },
    });
    return {
      id: complaint.id, subject: complaint.subject, description: complaint.description,
      status: complaint.status, orderId: complaint.orderId,
      createdAt: complaint.createdAt.toISOString(),
      resolvedAt: complaint.resolvedAt?.toISOString() ?? null,
      closedAt: complaint.closedAt?.toISOString() ?? null,
      messages: messages.map(m => ({ id: m.id, authorType: m.authorType, message: m.message, createdAt: m.createdAt.toISOString() })),
    };
  }

  /** Customer: add a message to own complaint. */
  async addCustomerMessage(customerId: string, complaintId: string, message: string): Promise<Record<string, unknown>> {
    const complaint = await prisma.customerComplaint.findUnique({ where: { id: complaintId } });
    if (!complaint || complaint.customerId !== customerId) {
      throw new NotFoundException('Complaint not found.');
    }
    if (complaint.status === 'CLOSED') {
      throw new BadRequestException('Cannot reply to a closed complaint.');
    }
    const msg = await prisma.complaintMessage.create({
      data: { complaintId, authorType: 'CUSTOMER', message },
    });
    return { id: msg.id, message: msg.message, authorType: msg.authorType, createdAt: msg.createdAt.toISOString() };
  }

  // ── Staff ──────────────────────────────────────────────────

  /** Staff: list all complaints for the tenant (RBAC-guarded). */
  async listStaff(tenantId: string): Promise<Array<Record<string, unknown>>> {
    const complaints = await prisma.customerComplaint.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return complaints.map(c => ({
      id: c.id, customerId: c.customerId, subject: c.subject,
      status: c.status, orderId: c.orderId,
      createdAt: c.createdAt.toISOString(),
    }));
  }

  /** Staff: get one complaint with messages. */
  async getStaff(tenantId: string, complaintId: string): Promise<Record<string, unknown>> {
    const complaint = await prisma.customerComplaint.findUnique({ where: { id: complaintId } });
    if (!complaint || complaint.tenantId !== tenantId) {
      throw new NotFoundException('Complaint not found.');
    }
    const messages = await prisma.complaintMessage.findMany({
      where: { complaintId }, orderBy: { createdAt: 'asc' },
    });
    return {
      id: complaint.id, customerId: complaint.customerId, subject: complaint.subject,
      description: complaint.description, status: complaint.status,
      orderId: complaint.orderId,
      createdAt: complaint.createdAt.toISOString(),
      resolvedAt: complaint.resolvedAt?.toISOString() ?? null,
      closedAt: complaint.closedAt?.toISOString() ?? null,
      messages: messages.map(m => ({ id: m.id, authorType: m.authorType, message: m.message, createdAt: m.createdAt.toISOString() })),
    };
  }

  /** Staff: add a reply to a complaint. */
  async addStaffMessage(tenantId: string, complaintId: string, message: string): Promise<Record<string, unknown>> {
    const complaint = await prisma.customerComplaint.findUnique({ where: { id: complaintId } });
    if (!complaint || complaint.tenantId !== tenantId) {
      throw new NotFoundException('Complaint not found.');
    }
    const msg = await prisma.complaintMessage.create({
      data: { complaintId, authorType: 'STAFF', message },
    });
    return { id: msg.id, message: msg.message, authorType: msg.authorType, createdAt: msg.createdAt.toISOString() };
  }

  /** Staff: update complaint status with validation. */
  async updateStatus(tenantId: string, complaintId: string, status: string): Promise<Record<string, unknown>> {
    if (!['NEW', 'REVIEWING', 'RESOLVED', 'CLOSED'].includes(status)) {
      throw new BadRequestException(`Invalid status: ${status}`);
    }
    const complaint = await prisma.customerComplaint.findUnique({ where: { id: complaintId } });
    if (!complaint || complaint.tenantId !== tenantId) {
      throw new NotFoundException('Complaint not found.');
    }
    this.assertStatusTransition(complaint.status, status);
    const updateData: Record<string, unknown> = { status };
    if (status === 'RESOLVED') {updateData.resolvedAt = new Date();}
    if (status === 'CLOSED') {updateData.closedAt = new Date();}
    const updated = await prisma.customerComplaint.update({
      where: { id: complaintId },
      data: updateData,
    });
    return {
      id: updated.id, status: updated.status,
      resolvedAt: updated.resolvedAt?.toISOString() ?? null,
      closedAt: updated.closedAt?.toISOString() ?? null,
    };
  }
}
