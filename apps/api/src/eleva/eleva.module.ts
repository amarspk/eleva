import { Module } from '@nestjs/common';
import { ElevaService } from './eleva.service';
import { AgentController } from './agent.controller';
import { AgentToolRegistryService, AgentExecutionService } from './agent.execution';
import { ElevaAdvisoryService } from './eleva.advisory';
import { ElevaResearchService } from './eleva.research';
import { ElevaExternalResearchProviderService } from './eleva.research.provider';
import { ElevaMemoryService } from './eleva.memory';
import { ElevaVoiceService } from './eleva.voice.service';
import { ElevaOfficeController } from './eleva.office.controller';
import { AuditModule } from '../audit/audit.module';
import { RbacPermissionGuard } from '../auth/guards/rbac-permission.guard';
import { CaslAbilityFactory } from '../auth/casl-ability.factory';

@Module({
  imports: [AuditModule],
  controllers: [AgentController, ElevaOfficeController],
  providers: [
    ElevaService,
    AgentToolRegistryService,
    AgentExecutionService,
    ElevaAdvisoryService,
    ElevaResearchService,
    ElevaExternalResearchProviderService,
    ElevaMemoryService,
    ElevaVoiceService,
    RbacPermissionGuard,
    CaslAbilityFactory,
  ],
  exports: [
    ElevaService,
    AgentToolRegistryService,
    AgentExecutionService,
    ElevaAdvisoryService,
    ElevaResearchService,
    ElevaExternalResearchProviderService,
    ElevaMemoryService,
    ElevaVoiceService,
  ],
})
export class ElevaModule {}
