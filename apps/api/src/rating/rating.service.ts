import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { prisma, dbTenantContext } from '@zayjar/db';
import { CreateRatingDto } from './dto/create-rating.dto';

@Injectable()
export class RatingService {
  private readonly logger = new Logger(RatingService.name);

  /** Customer: rate an eligible completed order (own order, tenant-scoped). */
  async rateOrder(customerId: string, dto: CreateRatingDto): Promise<Record<string, unknown>> {
    const order = await prisma.order.findUnique({ where: { id: dto.orderId } });
    const requestTenantId = dbTenantContext.getStore()?.tenantId;
    if (!order || order.customerId !== customerId || !requestTenantId || order.tenantId !== requestTenantId) {
      throw new NotFoundException('Order not found.');
    }
    if (order.status !== 'COMPLETED') {
      throw new BadRequestException('Only completed orders can be rated.');
    }
    const existing = await prisma.orderRating.findUnique({ where: { orderId: dto.orderId } });
    if (existing) {
      throw new BadRequestException('This order has already been rated.');
    }
    if (dto.rating < 1 || dto.rating > 5) {
      throw new BadRequestException('Rating must be between 1 and 5.');
    }
    const rating = await prisma.orderRating.create({
      data: {
        tenantId: order.tenantId,
        customerId,
        orderId: dto.orderId,
        rating: dto.rating,
        feedback: dto.feedback || null,
      },
    });
    return { id: rating.id, rating: rating.rating, feedback: rating.feedback, createdAt: rating.createdAt.toISOString() };
  }

  /** Customer: list own ratings (tenant-scoped by Prisma extension). */
  async listMy(customerId: string): Promise<Array<Record<string, unknown>>> {
    const ratings = await prisma.orderRating.findMany({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return ratings.map(r => ({
      id: r.id, rating: r.rating, feedback: r.feedback, orderId: r.orderId, createdAt: r.createdAt.toISOString(),
    }));
  }

  /** Customer: get a single own rating. */
  async getMy(customerId: string, ratingId: string): Promise<Record<string, unknown>> {
    const rating = await prisma.orderRating.findUnique({ where: { id: ratingId } });
    if (!rating || rating.customerId !== customerId) {
      throw new NotFoundException('Rating not found.');
    }
    return { id: rating.id, rating: rating.rating, feedback: rating.feedback, orderId: rating.orderId, createdAt: rating.createdAt.toISOString() };
  }

  /** Staff: list all ratings for the tenant (RBAC-guarded). */
  async listStaff(tenantId: string): Promise<Array<Record<string, unknown>>> {
    const ratings = await prisma.orderRating.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return ratings.map(r => ({
      id: r.id, customerId: r.customerId, orderId: r.orderId, rating: r.rating, feedback: r.feedback, createdAt: r.createdAt.toISOString(),
    }));
  }

  /** Public: show visible ratings for a restaurant (tenant-scoped, no private info). */
  async listPublic(tenantId: string): Promise<Array<Record<string, unknown>>> {
    const ratings = await prisma.orderRating.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    return ratings.map(r => ({
      rating: r.rating, feedback: r.feedback,
    }));
  }
}