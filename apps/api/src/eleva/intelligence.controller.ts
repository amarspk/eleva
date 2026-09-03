import { Controller, Get, Param, Body, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RbacPermissionGuard } from '../auth/guards/rbac-permission.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { ElevaIntelligenceService } from './eleva.intelligence';
import {
  CreateSignalRequest,
  Signal,
  Event,
  Situation,
  SituationState,
  Severity,
  AlertM7,
  RecommendationM7,
  ScheduledCheckResult,
  SituationMemoryRecord,
  M7IntelligenceContext,
  EventCategoryM7,
} from './eleva.state';

export interface IntelligenceHealthResponse {
  provider: string;
  available: boolean;
  reason?: string;
}

@Controller('eleva-office/intelligence')
export class ElevaIntelligenceController {
  constructor(private readonly intelligenceService: ElevaIntelligenceService) {}

  @Get('context')
  @UseGuards(JwtAuthGuard, RbacPermissionGuard)
  @RequirePermission('read', 'agent')
  getContext(): M7IntelligenceContext {
    return this.intelligenceService.getIntelligenceContext();
  }

  @Get('situations')
  @UseGuards(JwtAuthGuard, RbacPermissionGuard)
  @RequirePermission('read', 'agent')
  listSituations(): Situation[] {
    return this.intelligenceService.listSituations();
  }

  @Get('situations/:situationId')
  @UseGuards(JwtAuthGuard, RbacPermissionGuard)
  @RequirePermission('read', 'agent')
  getSituation(@Param('situationId') situationId: string): Situation {
    const situation = this.intelligenceService.getSituation(situationId);
    if (!situation) {
      throw new Error(`Situation [${situationId}] was not found.`);
    }
    return situation;
  }

  @Post('signals')
  @UseGuards(JwtAuthGuard, RbacPermissionGuard)
  @RequirePermission('read', 'agent')
  async ingestSignal(@Body() body: CreateSignalRequest): Promise<Signal> {
    return this.intelligenceService.ingestSignal(body);
  }

  @Post('events')
  @UseGuards(JwtAuthGuard, RbacPermissionGuard)
  @RequirePermission('read', 'agent')
  convertSignal(@Body() body: { signalId: string; category: string; correlationKey?: string }): Event {
    return this.intelligenceService.convertSignalToEvent(body.signalId, body.category as EventCategoryM7, body.correlationKey);
  }

  @Post('situations/correlate')
  @UseGuards(JwtAuthGuard, RbacPermissionGuard)
  @RequirePermission('read', 'agent')
  correlate(@Body() body: { eventIds: string[]; correlationReason: string; criteria?: Record<string, unknown> }): { situationIds: string[] } {
    const situationIds = this.intelligenceService.correlateEvents(body.eventIds, {
      eventIds: body.eventIds,
      reason: body.correlationReason,
      criteria: body.criteria ?? {},
    });
    return { situationIds };
  }

  @Post('situations/:situationId/anomalies')
  @UseGuards(JwtAuthGuard, RbacPermissionGuard)
  @RequirePermission('read', 'agent')
  detectAnomalies(@Param('situationId') situationId: string): { situationId: string; anomalies: { ruleId: string; reason?: string; evidence?: Record<string, unknown> }[] } {
    const situation = this.intelligenceService.getSituation(situationId);
    if (!situation) {
      throw new Error(`Situation [${situationId}] was not found.`);
    }
    const anomalies = this.intelligenceService.detectAnomalies(situation.eventIds);
    return { situationId, anomalies };
  }

  @Post('situations/:situationId/severity')
  @UseGuards(JwtAuthGuard, RbacPermissionGuard)
  @RequirePermission('read', 'agent')
  setSeverity(
    @Param('situationId') situationId: string,
    @Body() body: { severity: Severity; reason: string; evidence: Record<string, unknown> },
  ): Situation {
    return this.intelligenceService.assessSituationSeverity(situationId, body.severity, body.reason, body.evidence);
  }

  @Post('situations/:situationId/recommendations')
  @UseGuards(JwtAuthGuard, RbacPermissionGuard)
  @RequirePermission('read', 'agent')
  createRecommendation(
    @Param('situationId') situationId: string,
    @Body() body: { summary: string; proposedAction: string; reason: string; risk: { classification: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'; area: string; triggerOrEvidence: string; mitigation: string }; approvalRequired: boolean },
  ): RecommendationM7 {
    return this.intelligenceService.createRecommendation(situationId, {
      summary: body.summary,
      proposedAction: body.proposedAction,
      reason: body.reason,
      risk: body.risk,
      approvalRequired: body.approvalRequired,
    });
  }

  @Post('situations/:situationId/alerts')
  @UseGuards(JwtAuthGuard, RbacPermissionGuard)
  @RequirePermission('read', 'agent')
  createAlert(
    @Param('situationId') situationId: string,
    @Body() body: { reason: string; evidence: Record<string, unknown> },
  ): AlertM7 {
    return this.intelligenceService.alertForSituation(situationId, body.reason, body.evidence);
  }

  @Post('situations/:situationId/state')
  @UseGuards(JwtAuthGuard, RbacPermissionGuard)
  @RequirePermission('read', 'agent')
  advanceState(@Param('situationId') situationId: string, @Body() body: { state: SituationState }): Situation {
    return this.intelligenceService.advanceSituationState(situationId, body.state);
  }

  @Post('scheduled-checks')
  @UseGuards(JwtAuthGuard, RbacPermissionGuard)
  @RequirePermission('read', 'agent')
  async scheduledCheck(@Body() body: { provider: string }): Promise<ScheduledCheckResult> {
    return this.intelligenceService.executeScheduledCheck(body.provider);
  }

  @Post('providers/availability')
  @UseGuards(JwtAuthGuard, RbacPermissionGuard)
  @RequirePermission('read', 'agent')
  setProviderAvailability(@Body() body: { provider: string; available: boolean; reason?: string }): IntelligenceHealthResponse {
    this.intelligenceService.setProviderAvailability(body.provider, body.available, body.reason);
    return { provider: body.provider, available: body.available, reason: body.reason };
  }

  @Post('situations/:situationId/memory')
  @UseGuards(JwtAuthGuard, RbacPermissionGuard)
  @RequirePermission('read', 'agent')
  rememberSituationMemory(
    @Param('situationId') situationId: string,
    @Body() body: SituationMemoryRecord & { memoryKey: string; value: string },
  ): SituationMemoryRecord[] {
    const record: SituationMemoryRecord = {
      situationId,
      memoryKey: body.memoryKey,
      value: body.value,
      provenance: body.provenance,
      updatedAt: new Date(),
    };
    this.intelligenceService.rememberSituationMemory(record);
    return this.intelligenceService.recallSituationMemory(situationId);
  }

  @Get('situations/:situationId/memory')
  @UseGuards(JwtAuthGuard, RbacPermissionGuard)
  @RequirePermission('read', 'agent')
  getSituationMemory(@Param('situationId') situationId: string): SituationMemoryRecord[] {
    return this.intelligenceService.recallSituationMemory(situationId);
  }
}
