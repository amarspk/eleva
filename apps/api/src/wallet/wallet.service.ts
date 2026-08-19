import { Injectable, Logger, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { prisma, dbTenantContext } from '@zayjar/db';

@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name);

  /** Get or create the wallet for a customer (tenant-scoped). */
  private async getOrCreateWallet(customerId: string, tenantId: string): Promise<{ id: string; balance: number }> {
    return dbTenantContext.run({ tenantId }, async () => {
      let wallet = await (prisma as any).customerWallet.findUnique({ where: { customerId } });
      // findUnique is not tenant-injected; a globally-unique customerId must
      // still belong to this tenant or staff could credit another restaurant.
      if (wallet && wallet.tenantId !== tenantId) {
        throw new NotFoundException('Customer not found.');
      }
      if (!wallet) {
        wallet = await (prisma as any).customerWallet.create({
          data: { tenantId, customerId, balance: 0 },
        });
      }
      return { id: wallet.id, balance: Number(wallet.balance) };
    });
  }

  /** Customer self-service: balance + recent transactions. */
  async getMyWallet(customerId: string): Promise<{ balance: number; transactions: Array<Record<string, unknown>> }> {
    const store = dbTenantContext.getStore();
    const tenantId = store?.tenantId;
    if (!tenantId) throw new ForbiddenException('Tenant context required.');
    const wallet = await this.getOrCreateWallet(customerId, tenantId);
    const txs = await (prisma as any).walletTransaction.findMany({
      where: { walletId: wallet.id },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return {
      balance: wallet.balance,
      transactions: txs.map((tx: Record<string, unknown>) => ({
        id: tx.id,
        type: tx.type,
        amount: Number(tx.amount),
        balanceAfter: Number(tx.balanceAfter),
        orderId: tx.orderId,
        description: tx.description,
        createdAt: (tx.createdAt as Date).toISOString(),
      })),
    };
  }

  /** Staff grant credit (RBAC-guarded, tenant-scoped). */
  async grantCredit(tenantId: string, customerId: string, amount: number, description?: string): Promise<{ balance: number }> {
    if (!amount || amount <= 0) throw new BadRequestException('Credit amount must be positive.');
    return dbTenantContext.run({ tenantId }, async () => {
      const customer = await prisma.customer.findUnique({ where: { id: customerId }, select: { id: true } });
      if (!customer) throw new NotFoundException('Customer not found.');
      const wallet = await this.getOrCreateWallet(customerId, tenantId);
      const newBalance = wallet.balance + amount;
      const data: Record<string, unknown> = {
        data: { balance: newBalance },
      };
      // Must use proper decimal update
      await (prisma as any).customerWallet.update({
        where: { id: wallet.id },
        data: { balance: newBalance },
      });
      await (prisma as any).walletTransaction.create({
        data: {
          tenantId, customerId, walletId: wallet.id,
          type: 'CREDIT', amount, balanceAfter: newBalance,
          description: description || 'Credit granted by restaurant',
        },
      });
      return { balance: newBalance };
    });
  }

  /** Staff view of a customer's wallet (RBAC-guarded, tenant-scoped). */
  async getStaffWallet(tenantId: string, customerId: string): Promise<{ balance: number; transactions: Array<Record<string, unknown>> } | null> {
    return dbTenantContext.run({ tenantId }, async () => {
      const wallet = await (prisma as any).customerWallet.findUnique({ where: { customerId } });
      if (!wallet) return null;
      const txs = await (prisma as any).walletTransaction.findMany({
        where: { walletId: wallet.id },
        orderBy: { createdAt: 'desc' },
        take: 100,
      });
      return {
        balance: Number(wallet.balance),
        transactions: txs.map((tx: Record<string, unknown>) => ({
          id: tx.id, type: tx.type, amount: Number(tx.amount),
          balanceAfter: Number(tx.balanceAfter), orderId: tx.orderId,
          description: tx.description, createdAt: (tx.createdAt as Date).toISOString(),
        })),
      };
    });
  }

  /** Checkout: use wallet credit for an order (called from OrderService). */
  async useWalletForOrder(
    tenantId: string, customerId: string, orderId: string, orderTotal: number,
  ): Promise<{ walletUsed: number; remainingTotal: number }> {
    return dbTenantContext.run({ tenantId }, async () => {
      return (prisma as any).$transaction(async (tx: any) => {
        const wallet = await tx.customerWallet.findUnique({ where: { customerId } });
        if (!wallet || wallet.tenantId !== tenantId) {
          return { walletUsed: 0, remainingTotal: orderTotal };
        }
        const balance = Number(wallet.balance);
        const walletUsed = Math.min(balance, Math.max(0, orderTotal));
        if (walletUsed <= 0) return { walletUsed: 0, remainingTotal: orderTotal };
        const newBalance = balance - walletUsed;
        await tx.customerWallet.update({
          where: { id: wallet.id },
          data: { balance: newBalance },
        });
        await tx.walletTransaction.create({
          data: {
            tenantId, customerId, walletId: wallet.id,
            type: 'ORDER_PAYMENT', amount: -walletUsed,
            balanceAfter: newBalance, orderId,
            description: `Payment for order`,
          },
        });
        return { walletUsed, remainingTotal: orderTotal - walletUsed };
      });
    });
  }
}
