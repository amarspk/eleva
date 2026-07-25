import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { CreatePresignedUrlRequestDto } from './dto/create-presigned-url-request.dto';
import { randomUUID } from 'crypto';

@Injectable()
export class AssetService {
  private readonly logger = new Logger(AssetService.name);

  private readonly ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
  private readonly MAX_FILE_SIZES: Record<string, number> = {
    logo: 2 * 1024 * 1024, // 2MB for logos per DOC-007 6.5
    banner: 4 * 1024 * 1024, // 4MB for banners
    product: 5 * 1024 * 1024, // 5MB for product photos
    default: 5 * 1024 * 1024,
  };

  /**
   * Generates S3 pre-signed URL for direct upload per DOC-007 6.1
   * Tenant isolation: key includes tenantId, never trust client tenantId
   */
  async createPresignedUrl(dto: CreatePresignedUrlRequestDto, tenantId: string, userId: string) {
    this.logger.log(`Generating presigned URL for tenant [${tenantId}] user [${userId}] file [${dto.fileName}]`);

    // Validate MIME type
    if (!this.ALLOWED_MIME_TYPES.includes(dto.contentType)) {
      throw new BadRequestException(
        `Invalid content type [${dto.contentType}]. Allowed: ${this.ALLOWED_MIME_TYPES.join(', ')}`,
      );
    }

    // Validate file size based on folder type
    const folder = dto.folder || 'products';
    const maxSize = this.getMaxSizeForFolder(folder);
    if (dto.fileSize > maxSize) {
      throw new BadRequestException(
        `File size [${dto.fileSize}] exceeds maximum allowed [${maxSize}] for folder [${folder}]`,
      );
    }

    // Determine extension from fileName or contentType
    const extension = this.getExtension(dto.fileName, dto.contentType);
    const fileId = randomUUID();
    const key = `tenants/${tenantId}/${folder}/${fileId}${extension}`;

    // Try to generate real S3 presigned URL if AWS credentials configured
    const bucket = process.env.S3_BUCKET || 'zayjar-assets-production';
    const region = process.env.AWS_REGION || 'us-east-1';
    const expiresIn = 5 * 60; // 5 minutes per DOC-007

    let presignedUrl: string;
    let publicUrl: string;

    const awsAccessKey = process.env.AWS_ACCESS_KEY_ID;
    const awsSecretKey = process.env.AWS_SECRET_ACCESS_KEY;

    if (awsAccessKey && awsSecretKey) {
      try {
        // Dynamic import to avoid hard dependency at build time if SDK not installed
        const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
        const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

        const s3Client = new S3Client({
          region,
          credentials: {
            accessKeyId: awsAccessKey,
            secretAccessKey: awsSecretKey,
          },
        });

        const command = new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          ContentType: dto.contentType,
          ContentLength: dto.fileSize,
        });

        presignedUrl = await getSignedUrl(s3Client, command, { expiresIn });
        publicUrl = `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
      } catch (err) {
        this.logger.warn(`S3 presigned URL generation failed, falling back to mock: ${(err as Error).message}`);
        presignedUrl = this.generateMockPresignedUrl(bucket, key, dto.contentType, expiresIn);
        publicUrl = `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
      }
    } else {
      // Mock mode for dev/test/CI without AWS creds
      this.logger.warn('AWS credentials not configured, returning mock presigned URL');
      presignedUrl = this.generateMockPresignedUrl(bucket, key, dto.contentType, expiresIn);
      publicUrl = `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
    }

    return {
      presignedUrl,
      publicUrl,
      key,
      expiresIn,
      contentType: dto.contentType,
    };
  }

  private getMaxSizeForFolder(folder: string): number {
    const lower = folder.toLowerCase();
    if (lower.includes('logo')) {return this.MAX_FILE_SIZES.logo;}
    if (lower.includes('banner')) {return this.MAX_FILE_SIZES.banner;}
    if (lower.includes('product')) {return this.MAX_FILE_SIZES.product;}
    return this.MAX_FILE_SIZES.default;
  }

  private getExtension(fileName: string, contentType: string): string {
    const fromName = fileName.includes('.') ? `.${fileName.split('.').pop()}` : '';
    if (fromName) {return fromName;}

    const mimeToExt: Record<string, string> = {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/webp': '.webp',
    };
    return mimeToExt[contentType] || '.bin';
  }

  private generateMockPresignedUrl(bucket: string, key: string, contentType: string, expiresIn: number): string {
    const expiresAt = Date.now() + expiresIn * 1000;
    const mockSignature = `mock-signature-${Math.random().toString(36).substring(2, 15)}`;
    return `https://${bucket}.s3.amazonaws.com/${key}?Content-Type=${encodeURIComponent(
      contentType,
    )}&X-Amz-Expires=${expiresIn}&X-Amz-Signature=${mockSignature}&Expires=${expiresAt}`;
  }
}
