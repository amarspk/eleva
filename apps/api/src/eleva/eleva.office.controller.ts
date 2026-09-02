import { Controller, Get, Param, Body, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RbacPermissionGuard } from '../auth/guards/rbac-permission.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedRequest } from '../common/types/request.types';
import { ElevaService } from './eleva.service';
import { ElevaMemoryService } from './eleva.memory';
import { ElevaVoiceService } from './eleva.voice.service';
import { ElevaExternalResearchProviderService } from './eleva.research.provider';
import { MemoryCategory, AdvisoryResponse, MemoryEvidenceClassification, AgentCapability, AgentApprovalResponse } from './eleva.state';
import { VoiceInteractionStateMachineEvent } from './eleva.voice';

export interface ConversationStartResponse {
  conversationId: string;
  messages: { id: string; role: string; content: string }[];
}

export interface MemoryUpsertRequest {
  category: MemoryCategory;
  key: string;
  value: string;
  evidenceClassification: string;
  conversationId?: string;
  tags?: string[];
}

export interface MemoryUpsertResponse {
  id: string;
  category: MemoryCategory;
  key: string;
  value: string;
  updatedAt: string;
}

export interface VoiceStateResponse {
  supported: boolean;
  state: string;
}

export interface AdvisoryRequest {
  message: string;
  forceResearch?: boolean;
}

export interface ApproveRequest {
  actionId: string;
  capability: AgentCapability;
}

export interface RevokeRequest {
  actionId: string;
}

export interface ExecuteRequest {
  actionId: string;
}

@Controller('eleva-office')
export class ElevaOfficeController {
  constructor(
    private readonly elevaservice: ElevaService,
    private readonly memoryService: ElevaMemoryService,
    private readonly voiceService: ElevaVoiceService,
    private readonly researchProvider: ElevaExternalResearchProviderService,
  ) {}

  @Get('status')
  @UseGuards(JwtAuthGuard, RbacPermissionGuard)
  @RequirePermission('read', 'agent')
  getOfficeStatus(): Record<string, unknown> {
    const state = this.elevaservice.getStatus();
    const voice = this.voiceService.getStateSnapshot();
    return {
      officeContext: state.officeContext,
      persona: state.persona,
      status: state.status,
      activeCapability: state.activeCapability,
      updatedAt: state.updatedAt,
      voice: {
        supported: this.voiceService.isVoiceSupported(),
        state: voice.state,
      },
      research: this.researchProvider.getBoundary(),
    };
  }

  @Post('conversations')
  @UseGuards(JwtAuthGuard, RbacPermissionGuard)
  @RequirePermission('read', 'agent')
  startConversation(@CurrentUser() request: AuthenticatedRequest): ConversationStartResponse {
    if (!request.user) {
      throw new Error('Authenticated user is required for conversation start.');
    }
    const conversationId = `conversation:${request.user.id}:${Date.now()}`;
    const context = this.memoryService.startConversation(conversationId);
    return {
      conversationId: context.conversationId,
      messages: context.messages.map((message) => ({
        id: message.id,
        role: message.role,
        content: message.content,
      })),
    };
  }

  @Get('conversations/:conversationId')
  @UseGuards(JwtAuthGuard, RbacPermissionGuard)
  @RequirePermission('read', 'agent')
  getConversation(@Param('conversationId') conversationId: string): ConversationStartResponse {
    const context = this.memoryService.getConversation(conversationId);
    if (!context) {
      return { conversationId, messages: [] };
    }
    return {
      conversationId: context.conversationId,
      messages: context.messages.map((message) => ({
        id: message.id,
        role: message.role,
        content: message.content,
      })),
    };
  }

  @Post('conversations/:conversationId/message')
  @UseGuards(JwtAuthGuard, RbacPermissionGuard)
  @RequirePermission('read', 'agent')
  respond(
    @CurrentUser() request: AuthenticatedRequest,
    @Param('conversationId') conversationId: string,
    @Body() body: AdvisoryRequest & Record<string, unknown>,
  ): Promise<AdvisoryResponse> {
    if (!request.user) {
      throw new Error('Authenticated user is required for advisory responses.');
    }
    const message = typeof body.message === 'string' ? body.message : String(body.message ?? '');
    const forceResearch = typeof body.forceResearch === 'boolean' ? body.forceResearch : undefined;
    return this.memoryService.respondToConversation(conversationId, message, {
      forceResearch: forceResearch ?? false,
    });
  }

  @Get('memory')
  @UseGuards(JwtAuthGuard, RbacPermissionGuard)
  @RequirePermission('read', 'agent')
  getMemory(): MemoryUpsertResponse[] {
    return this.memoryService.recall().map((entry) => ({
      id: entry.id,
      category: entry.category,
      key: entry.key,
      value: entry.value,
      updatedAt: entry.updatedAt.toISOString(),
      provenance: {
        evidenceClassification: entry.provenance.evidenceClassification,
        source: entry.provenance.source,
      },
    }));
  }

  @Post('memory')
  @UseGuards(JwtAuthGuard, RbacPermissionGuard)
  @RequirePermission('read', 'agent')
  remember(@Body() body: MemoryUpsertRequest): MemoryUpsertResponse {
    const evidenceClassification = body.evidenceClassification as MemoryEvidenceClassification;
    const entry = this.memoryService.remember({
      category: body.category,
      key: body.key,
      value: body.value,
      provenance: {
        evidenceClassification,
        source: 'user-provided',
        retrievedAt: new Date(),
      },
      conversationId: body.conversationId,
      tags: body.tags,
    });

    return {
      id: entry.id,
      category: entry.category,
      key: entry.key,
      value: entry.value,
      updatedAt: entry.updatedAt.toISOString(),
    };
  }

  @Get('voice/state')
  @UseGuards(JwtAuthGuard, RbacPermissionGuard)
  @RequirePermission('read', 'agent')
  getVoiceState(): VoiceStateResponse {
    const snapshot = this.voiceService.getStateSnapshot();
    return {
      supported: this.voiceService.isVoiceSupported(),
      state: snapshot.state,
    };
  }

  @Post('voice/transition')
  @UseGuards(JwtAuthGuard, RbacPermissionGuard)
  @RequirePermission('read', 'agent')
  transitionVoice(@Body('event') event: string): VoiceStateResponse {
    const snapshot = this.voiceService.transition(event as VoiceInteractionStateMachineEvent);
    return {
      supported: this.voiceService.isVoiceSupported(),
      state: snapshot.state,
    };
  }

  @Get('research/boundary')
  @UseGuards(JwtAuthGuard, RbacPermissionGuard)
  @RequirePermission('read', 'agent')
  getResearchBoundary(): Record<string, unknown> {
    return this.researchProvider.getBoundary();
  }

  @Get('approvals')
  @UseGuards(JwtAuthGuard, RbacPermissionGuard)
  @RequirePermission('read', 'agent')
  getApprovals(): AgentApprovalResponse[] {
    return this.elevaservice.listPendingApprovals();
  }

  @Post('approvals/approve')
  @UseGuards(JwtAuthGuard, RbacPermissionGuard)
  @RequirePermission('read', 'agent')
  approve(@Body() body: ApproveRequest): AgentApprovalResponse {
    this.elevaservice.recordApproval(body.actionId, body.capability);
    return this.elevaservice.getApproval(body.actionId);
  }

  @Post('approvals/revoke')
  @UseGuards(JwtAuthGuard, RbacPermissionGuard)
  @RequirePermission('read', 'agent')
  revoke(@Body() body: RevokeRequest): { actionId: string; revoked: boolean } {
    const revoked = this.elevaservice.revokeApproval(body.actionId);
    return { actionId: body.actionId, revoked };
  }

  @Post('approvals/execute')
  @UseGuards(JwtAuthGuard, RbacPermissionGuard)
  @RequirePermission('read', 'agent')
  executeApproval(@Body() body: ExecuteRequest): { actionId: string; executed: boolean } {
    const marked = this.elevaservice.markExecuted(body.actionId);
    return { actionId: body.actionId, executed: marked };
  }
}
