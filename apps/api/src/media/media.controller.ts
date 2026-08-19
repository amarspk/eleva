import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  Query,
  Body,
  UploadedFile,
  UseInterceptors,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { MediaService } from './media.service';
import { UploadMediaDto } from './dto/upload-media.dto';
import { MediaResponseDto } from './dto/media-response.dto';
import { AuthenticatedRequest } from '../common/types/request.types';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RbacPermissionGuard } from '../auth/guards/rbac-permission.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';

@Controller('api/v1/media')
@UseGuards(JwtAuthGuard, RbacPermissionGuard)
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  @Post('upload')
  @RequirePermission('create', 'Media')
  @UseInterceptors(FileInterceptor('file', { storage: undefined, limits: { fileSize: 10 * 1024 * 1024 } }))
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadMediaDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<MediaResponseDto> {
    if (!file) {
      throw new BadRequestException('File is required');
    }

    const tenantId = req.user?.tenantId;
    if (!tenantId) {
      throw new ForbiddenException('Tenant context is required');
    }

    return this.mediaService.upload(file, dto.entityType, dto.entityId, dto.mediaType, tenantId);
  }

  @Get()
  @RequirePermission('read', 'Media')
  async findAll(
    @Req() req: AuthenticatedRequest,
    @Query('entityType') entityType?: string,
    @Query('entityId') entityId?: string,
  ): Promise<MediaResponseDto[]> {
    const tenantId = req.user?.tenantId;
    if (!tenantId) {
      throw new ForbiddenException('Tenant context is required');
    }
    return this.mediaService.findAll(tenantId, entityType, entityId);
  }

  @Get(':id')
  @RequirePermission('read', 'Media')
  async findOne(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<MediaResponseDto> {
    const tenantId = req.user?.tenantId;
    if (!tenantId) {
      throw new ForbiddenException('Tenant context is required');
    }
    return this.mediaService.findOne(id, tenantId);
  }

  @Delete(':id')
  @RequirePermission('delete', 'Media')
  @HttpCode(HttpStatus.OK)
  async remove(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<{ message: string }> {
    const tenantId = req.user?.tenantId;
    if (!tenantId) {
      throw new ForbiddenException('Tenant context is required');
    }
    await this.mediaService.remove(id, tenantId);
    return { message: 'Media deleted successfully' };
  }
}
