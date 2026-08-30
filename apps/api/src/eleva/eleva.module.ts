import { Module } from '@nestjs/common';
import { ElevaService } from './eleva.service';
import { AgentController } from './agent.controller';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AuditModule],
  providers: [ElevaService],
  controllers: [AgentController],
  exports: [ElevaService],
})
export class ElevaModule {}
