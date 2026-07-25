export class MediaResponseDto {
  id!: string;
  tenantId!: string;
  entityType!: string;
  entityId!: string;
  mediaType!: string;
  originalName!: string;
  mimeType!: string;
  originalFileSize!: number;
  fileSize!: number;
  checksum!: string;
  width?: number | null;
  height?: number | null;
  storageKey!: string;
  storageProvider!: string;
  originalUrl!: string;
  thumbnailUrl?: string | null;
  mediumUrl?: string | null;
  largeUrl?: string | null;
  status!: string;
  createdAt!: Date;
  updatedAt!: Date;
}
