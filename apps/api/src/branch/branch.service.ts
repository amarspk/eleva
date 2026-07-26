import { Injectable, Logger } from '@nestjs/common';
import { CreateBranchRequestDto } from './dto/create-branch-request.dto';
import { CreateTableRequestDto } from './dto/create-table-request.dto';
import { TenantBranchRepository, TenantTableRepository, Branch, Table } from '@zayjar/db';
import * as crypto from 'crypto';

@Injectable()
export class BranchService {
  private readonly logger = new Logger('BranchService');
  private readonly branchRepository = new TenantBranchRepository();
  private readonly tableRepository = new TenantTableRepository();

  /**
   * Creates a physical branch location under a restaurant brand.
   */
  async createBranch(dto: CreateBranchRequestDto): Promise<Branch> {
    this.logger.log(`Creating branch location: [${dto.name}]`);
    return this.branchRepository.create({
      restaurantId: dto.restaurantId,
      name: dto.name,
      address: dto.address,
      latitude: dto.latitude,
      longitude: dto.longitude,
      phoneNumber: dto.phoneNumber,
      operatingHours: dto.operatingHours,
      isActive: true,
    });
  }

  /**
   * Retrieves all branches scoping to the active tenant.
   */
  async getBranches(): Promise<Branch[]> {
    return this.branchRepository.findMany();
  }

  /**
   * Provisions a seating table and generates its secure cryptographic QR token.
   */
  async createTable(dto: CreateTableRequestDto): Promise<Table> {
    this.logger.log(`Provisioning seating table number: [${dto.number}]`);

    // 1. Fetch current tenantId from active repository thread
    const branch = await this.branchRepository.findById(dto.branchId);
    if (!branch) {
      throw new Error(`The requested Branch with ID [${dto.branchId}] was not found.`);
    }

    const tenantId = branch.tenantId;
    const pepper = process.env.SYSTEM_PEPPER || 'zayjar-default-pepper-999!';

    // ==========================================
    // SECURE QR TOKEN ENCRYPTION PATH
    // ==========================================
    const signaturePayload = `${tenantId}:${dto.branchId}:${dto.number}`;
    const qrCodeToken = crypto
      .createHmac('sha256', pepper)
      .update(signaturePayload)
      .digest('hex');

    // Write to PostgreSQL via the repository
    return this.tableRepository.create({
      branchId: dto.branchId,
      number: dto.number,
      seatingCapacity: dto.seatingCapacity,
      qrCodeToken,
      status: 'VACANT',
    });
  }

  /**
   * Retrieves all seating tables scoped to the branch.
   */
  async getTables(branchId: string): Promise<Table[]> {
    return this.tableRepository.findMany({ branchId });
  }
}
