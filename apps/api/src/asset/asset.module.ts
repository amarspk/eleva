import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AssetService } from './asset.service';
import { AssetOptimizationService } from './asset-optimization.service';
import { AssetController } from './asset.controller';

@Module({
  imports: [AuthModule],
  controllers: [AssetController],
  providers: [AssetService, AssetOptimizationService],
  exports: [AssetService, AssetOptimizationService],
})
export class AssetModule {}
