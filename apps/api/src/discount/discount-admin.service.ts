import { Injectable, Logger, NotFoundException, ConflictException } from '@nestjs/common';
import { TenantDiscountRepository, Discount } from '@zayjar/db';
import { CreateDiscountRequestDto } from './dto/create-discount-request.dto';
import { UpdateDiscountRequestDto } from './dto/update-discount-request.dto';

export interface DeleteDiscountResult {
  id: string;
  deleted: boolean;
}

/**
 * AUDIT-009 — staff management of Discount rows.
 *
 * The checkout engine (DiscountService static methods + order.service
 * findUnique on tenantId_code) is unchanged. Codes are stored uppercased
 * to match checkout normalization. usageCount is never written by callers.
 */
@Injectable()
export class DiscountAdminService {
  private readonly logger = new Logger('DiscountAdminService');
  private readonly discountRepository = new TenantDiscountRepository();

  async findAll(): Promise<Discount[]> {
    return this.discountRepository.findMany({}, { orderBy: { code: 'asc' } });
  }

  async findOne(id: string): Promise<Discount> {
    const row = await this.discountRepository.findById(id);
    if (!row) {
      throw new NotFoundException(`The requested Discount with ID [${id}] was not found.`);
    }
    return row;
  }

  async create(dto: CreateDiscountRequestDto): Promise<Discount> {
    const code = normalizeCode(dto.code);
    await this.assertCodeAvailable(code);

    this.logger.log(`Creating discount code [${code}]`);
    return this.discountRepository.create({
      code,
      name: dto.name ?? null,
      description: dto.description ?? null,
      type: dto.type,
      value: dto.value,
      active: dto.active ?? true,
      validFrom: dto.validFrom ? new Date(dto.validFrom) : null,
      validTo: dto.validTo ? new Date(dto.validTo) : null,
      usageLimit: dto.usageLimit ?? null,
    });
  }

  async update(id: string, dto: UpdateDiscountRequestDto): Promise<Discount> {
    const existing = await this.discountRepository.findById(id);
    if (!existing) {
      throw new NotFoundException(`The requested Discount with ID [${id}] was not found.`);
    }

    const data: Record<string, unknown> = {};
    if (dto.code !== undefined) {
      const code = normalizeCode(dto.code);
      if (code !== existing.code) {
        await this.assertCodeAvailable(code, id);
      }
      data.code = code;
    }
    if (dto.name !== undefined) {
      data.name = dto.name;
    }
    if (dto.description !== undefined) {
      data.description = dto.description;
    }
    if (dto.type !== undefined) {
      data.type = dto.type;
    }
    if (dto.value !== undefined) {
      data.value = dto.value;
    }
    if (dto.active !== undefined) {
      data.active = dto.active;
    }
    if (dto.validFrom !== undefined) {
      data.validFrom = dto.validFrom ? new Date(dto.validFrom) : null;
    }
    if (dto.validTo !== undefined) {
      data.validTo = dto.validTo ? new Date(dto.validTo) : null;
    }
    if (dto.usageLimit !== undefined) {
      data.usageLimit = dto.usageLimit;
    }

    if (Object.keys(data).length === 0) {
      return existing;
    }

    this.logger.log(`Updating discount [${id}]`);
    return this.discountRepository.update(id, data);
  }

  /**
   * Hard-delete. Discount has no deletedAt; Order.discountId is ON DELETE
   * SetNull so historical orders keep their snapshot discountCode/amount.
   */
  async remove(id: string): Promise<DeleteDiscountResult> {
    const existing = await this.discountRepository.findById(id);
    if (!existing) {
      throw new NotFoundException(`The requested Discount with ID [${id}] was not found.`);
    }
    await this.discountRepository.delete(id);
    this.logger.log(`Deleted discount [${id}]`);
    return { id, deleted: true };
  }

  private async assertCodeAvailable(code: string, exceptId?: string): Promise<void> {
    const matches = await this.discountRepository.findMany({ code });
    const conflict = matches.find((row) => row.id !== exceptId);
    if (conflict) {
      throw new ConflictException(`A discount with code [${code}] already exists for this tenant.`);
    }
  }
}

function normalizeCode(code: string): string {
  return code.trim().toUpperCase();
}
