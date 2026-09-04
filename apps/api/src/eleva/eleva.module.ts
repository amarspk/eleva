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
import { ElevaOperationalService } from './eleva.operations';
import { ElevaOperationalController } from './operational.controller';
import { ElevaIntelligenceService } from './eleva.intelligence';
import { ElevaIntelligenceController } from './intelligence.controller';
import { ElevaBusinessIntelligenceService } from './eleva.business.intelligence';
import { ElevaBusinessIntelligenceController } from './eleva.business.intelligence.controller';
import { ElevaAgentService } from './eleva.agent.service';
import { ElevaAgentController } from './eleva.agent.controller';
import { AuditModule } from '../audit/audit.module';
import { RbacPermissionGuard } from '../auth/guards/rbac-permission.guard';
import { CaslAbilityFactory } from '../auth/casl-ability.factory';

@Module({
  imports: [AuditModule],
  controllers: [AgentController, ElevaOfficeController, ElevaOperationalController, ElevaIntelligenceController, ElevaBusinessIntelligenceController, ElevaAgentController],
  providers: [
    ElevaService,
    AgentToolRegistryService,
    AgentExecutionService,
    ElevaAdvisoryService,
    ElevaResearchService,
    ElevaExternalResearchProviderService,
    ElevaMemoryService,
    ElevaVoiceService,
    ElevaOperationalService,
    ElevaIntelligenceService,
    ElevaBusinessIntelligenceService,
    ElevaAgentService,
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
    ElevaOperationalService,
    ElevaIntelligenceService,
    ElevaBusinessIntelligenceService,
    ElevaAgentService,
  ],
})
export class ElevaModule {}
