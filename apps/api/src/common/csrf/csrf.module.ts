import { Module, Global } from '@nestjs/common';
import { CsrfService } from './csrf.service';
import { CsrfGuard } from './csrf.guard';
import { CacheModule } from '../cache/cache.module';

@Global()
@Module({
  imports: [CacheModule],
  providers: [CsrfService, CsrfGuard],
  exports: [CsrfService, CsrfGuard],
})
export class CsrfModule {}
