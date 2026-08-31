import { Module } from '@nestjs/common';
import { ElevaService } from './eleva.service';
import { AgentController } from './agent.controller';
import { AgentToolRegistryService, AgentExecutionService } from './agent.execution';
import { ElevaAdvisoryService } from './eleva.advisory';
import { AuditModule } from '../audit/audit.module';
import { RbacPermissionGuard } from '../auth/guards/rbac-permission.guard';
import { CaslAbilityFactory } from '../auth/casl-ability.factory';

@Module({
  imports: [AuditModule],
  providers: [ElevaService, AgentToolRegistryService, AgentExecutionService, ElevaAdvisoryService, RbacPermissionGuard, CaslAbilityFactory],
  controllers: [AgentController],
  exports: [ElevaService, AgentToolRegistryService, AgentExecutionService, ElevaAdvisoryService],
})
export class ElevaModule {}
