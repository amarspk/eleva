import { Module } from '@nestjs/common';
import { AgentController } from './agent.controller';
import { AgentService } from './agent.service';
import { AgentOrchestrator } from './agent-orchestrator';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';
import { AGENT_LLM_PROVIDER } from './llm/agent-llm.types';
import { OllamaLlmProvider } from './llm/ollama-llm.provider';

@Module({
  imports: [AuthModule, AuditModule],
  controllers: [AgentController],
  providers: [
    AgentService,
    AgentOrchestrator,
    { provide: AGENT_LLM_PROVIDER, useClass: OllamaLlmProvider },
  ],
  exports: [AgentService, AgentOrchestrator],
})
export class AgentModule {}
