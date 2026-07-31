import { Controller, Post, Body, Req, UseGuards, HttpCode, HttpStatus, ForbiddenException } from '@nestjs/common';
import { AssetService } from './asset.service';
import { AssetOptimizationService } from './asset-optimization.service';
import { CreatePresignedUrlRequestDto } from './dto/create-presigned-url-request.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedRequest } from '../common/types/request.types';

@Controller('api/v1/assets')
@UseGuards(JwtAuthGuard)
export class AssetController {
  constructor(
    private readonly assetService: AssetService,
    private readonly optimizationService: AssetOptimizationService,
  ) {}

  /**
   * POST /api/v1/assets/presigned-url
   * Per DOC-007 6.1 Direct S3 Pre-Signed Upload Flow
   * Auth: Bearer, Tenant isolation via JWT tenantId, never from client
   */
  @Post('presigned-url')
  @HttpCode(HttpStatus.OK)
  async createPresignedUrl(@Body() dto: CreatePresignedUrlRequestDto, @Req() req: AuthenticatedRequest): Promise<{
    presignedUrl: string;
    publicUrl: string;
    key: string;
    expiresIn: number;
    contentType: string;
  }> {
    const user = req.user;
    if (!user) {
      throw new ForbiddenException('Authentication required');
    }

    const tenantId = user.tenantId;
    const userId = user.id;

    if (!tenantId) {
      throw new ForbiddenException('Tenant context missing from authenticated request');
    }

    return this.assetService.createPresignedUrl(dto, tenantId, userId);
  }

  /**
   * POST /api/v1/assets/optimize
   * Simulates S3 upload trigger for serverless image optimization per DOC-007 6.3
   * In production, this would be triggered by S3 event -> Lambda. Here exposed for manual trigger and testing.
   */
  @Post('optimize')
  @HttpCode(HttpStatus.OK)
  async optimizeImage(@Body() body: { bucket?: string; key: string; folder?: string }, @Req() req: AuthenticatedRequest): Promise<import('./asset-optimization.service').OptimizedResult> {
    const user = req.user;
    if (!user?.tenantId) {
      throw new ForbiddenException('Tenant context missing');
    }

    const bucket = body.bucket || process.env.S3_BUCKET || 'zayjar-assets-production';
    const key = body.key;
    const folder = body.folder || 'products';

    if (!key) {
      throw new ForbiddenException('S3 key is required');
    }

    return this.optimizationService.handleS3UploadTrigger({
      bucket,
      key,
      tenantId: user.tenantId,
      folder,
    });
  }
}
