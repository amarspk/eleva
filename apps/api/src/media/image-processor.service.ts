import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import * as crypto from 'crypto';
import { MEDIA_TYPE_CONFIG } from '@zayjar/types';

interface SharpInstance {
  rotate(): SharpInstance;
  resize(w: number, h: number, opts: Record<string, unknown>): SharpInstance;
  webp(opts: Record<string, unknown>): SharpInstance;
  toBuffer(opts: Record<string, unknown>): Promise<{ data: Buffer; info: { width: number; height: number } }>;
}

type SharpFactory = (input: Buffer) => SharpInstance;

export interface ProcessedImage {
  buffer: Buffer;
  width: number;
  height: number;
}

export interface ImageProcessingResult {
  original: ProcessedImage;
  thumbnail: ProcessedImage;
  medium: ProcessedImage;
  large: ProcessedImage;
}

export interface DocumentProcessingResult {
  buffer: Buffer;
}

@Injectable()
export class ImageProcessorService {
  private readonly logger = new Logger(ImageProcessorService.name);

  async processImage(
    inputBuffer: Buffer,
    mediaType: keyof typeof MEDIA_TYPE_CONFIG,
  ): Promise<ImageProcessingResult | DocumentProcessingResult> {
    const config = MEDIA_TYPE_CONFIG[mediaType];
    if (!config) {
      throw new BadRequestException(`Unknown media type: ${mediaType}`);
    }

    if (mediaType === 'DOCUMENT') {
      return { buffer: inputBuffer };
    }

    if (!config.dimensions) {
      throw new BadRequestException(`No dimensions configured for media type: ${mediaType}`);
    }

    const sharp = require('sharp');

    const original = await this.resizeBuffer(
      sharp,
      inputBuffer,
      config.dimensions.large.width * 2,
      config.dimensions.large.height * 2,
      'inside',
    );

    const [thumbnail, medium, large] = await Promise.all([
      this.resizeBuffer(sharp, inputBuffer, config.dimensions.thumbnail.width, config.dimensions.thumbnail.height, config.dimensions.thumbnail.fit),
      this.resizeBuffer(sharp, inputBuffer, config.dimensions.medium.width, config.dimensions.medium.height, config.dimensions.medium.fit),
      this.resizeBuffer(sharp, inputBuffer, config.dimensions.large.width, config.dimensions.large.height, config.dimensions.large.fit),
    ]);

    return { original, thumbnail, medium, large };
  }

  private async resizeBuffer(
    sharp: SharpFactory,
    inputBuffer: Buffer,
    width: number,
    height: number,
    fit: string,
  ): Promise<ProcessedImage> {
    const { data, info } = await sharp(inputBuffer)
      .rotate()
      .resize(width, height, {
        fit: fit as 'cover' | 'contain' | 'fill' | 'inside' | 'outside',
        withoutEnlargement: true,
      })
      .webp({ quality: 80 })
      .toBuffer({ resolveWithObject: true });

    return { buffer: data, width: info.width, height: info.height };
  }

  computeChecksum(buffer: Buffer): string {
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }
}
