import { Controller, Get, Post, Body, UseGuards, BadRequestException, Param } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RbacPermissionGuard } from '../auth/guards/rbac-permission.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedRequest } from '../common/types/request.types';
import { ElevaBusinessIntelligenceService } from './eleva.business.intelligence';
import { BusinessIntelligenceContext, DecisionSupportRequest, OperationalPlan } from './eleva.state';

@Controller('eleva-office/business')
export class ElevaBusinessIntelligenceController {
  constructor(private readonly intelligenceService: ElevaBusinessIntelligenceService) {}

  @Get('metrics')
  @UseGuards(JwtAuthGuard, RbacPermissionGuard)
  @RequirePermission('read', 'agent')
  async getMetrics(@CurrentUser() request: AuthenticatedRequest): Promise<BusinessIntelligenceContext> {
    if (!request.user) {
      throw new BadRequestException('Authenticated user is required for business metrics.');
    }

    return this.intelligenceService.getBusinessIntelligenceContext();
  }

  @Get('metrics/:metricId')
  @UseGuards(JwtAuthGuard, RbacPermissionGuard)
  @RequirePermission('read', 'agent')
  async getMetric(@CurrentUser() request: AuthenticatedRequest, @Param('metricId') _metricId: string): Promise<BusinessIntelligenceContext> {
    if (!request.user) {
      throw new BadRequestException('Authenticated user is required for business metrics.');
    }

    return this.intelligenceService.getBusinessIntelligenceContext();
  }

  @Get('insights')
  @UseGuards(JwtAuthGuard, RbacPermissionGuard)
  @RequirePermission('read', 'agent')
  async getInsights(@CurrentUser() request: AuthenticatedRequest): Promise<Array<Record<string, unknown>>> {
    if (!request.user) {
      throw new BadRequestException('Authenticated user is required for business insights.');
    }

    const context = await this.intelligenceService.getBusinessIntelligenceContext();
    return (context.insights as unknown) as Record<string, unknown>[];
  }

  @Post('decision-support')
  @UseGuards(JwtAuthGuard, RbacPermissionGuard)
  @RequirePermission('read', 'agent')
  async getDecisionSupport(@CurrentUser() request: AuthenticatedRequest, @Body() body: Record<string, unknown>): Promise<Record<string, unknown>> {
    if (!request.user) {
      throw new BadRequestException('Authenticated user is required for decision support.');
    }

    const question = typeof body.question === 'string' && body.question.trim() ? body.question.trim() : 'No question provided.';
    const options = Array.isArray(body.options)
      ? (body.options as Array<{ name?: string; benefits?: string[]; costsEffort?: string; risks?: Array<{ classification?: string; area?: string; triggerOrEvidence?: string; mitigation?: string }>; operationalImpact?: string }>)
      : [];
    const recommendation = await this.intelligenceService.buildDecisionSupport({
      question,
      currentState: typeof body.currentState === 'string' ? body.currentState : '',
      evidence: Array.isArray(body.evidence) ? (body.evidence as Array<Record<string, unknown>>).filter(Boolean) : [],
      options: options.map((option) => ({
        name: option.name ?? 'Unnamed option',
        benefits: Array.isArray(option.benefits) ? option.benefits.filter(Boolean) : [],
        costsEffort: option.costsEffort ?? 'CANNOT ESTIMATE',
        risks: Array.isArray(option.risks)
          ? option.risks.map((risk) => ({
              classification: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(risk.classification ?? '') ? (risk.classification as 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL') : 'MEDIUM',
              area: risk.area ?? 'general',
              triggerOrEvidence: risk.triggerOrEvidence ?? 'No evidence provided.',
              mitigation: risk.mitigation ?? 'No mitigation provided.',
            }))
          : [],
        operationalImpact: option.operationalImpact ?? 'Not specified.',
      })),
    } as Parameters<ElevaBusinessIntelligenceService['buildDecisionSupport']>[0]);

    return {
      requestId: (recommendation as DecisionSupportRequest).requestId,
      options: (recommendation as DecisionSupportRequest).options,
      recommendation: {
        recommendedOption: (recommendation as DecisionSupportRequest).recommendedOption,
        rationale: (recommendation as DecisionSupportRequest).rationale,
        risks: (recommendation as DecisionSupportRequest).risks,
        operationalImpact: (recommendation as DecisionSupportRequest).operationalImpact,
        technicalImpact: (recommendation as DecisionSupportRequest).technicalImpact,
      },
    };
  }

  @Post('plans')
  @UseGuards(JwtAuthGuard, RbacPermissionGuard)
  @RequirePermission('read', 'agent')
  async createPlan(@CurrentUser() request: AuthenticatedRequest, @Body() body: Record<string, unknown>): Promise<Record<string, unknown>> {
    if (!request.user) {
      throw new BadRequestException('Authenticated user is required for operational planning.');
    }

    const objective = typeof body.objective === 'string' && body.objective.trim() ? body.objective.trim() : 'Operational plan.';
    const tasks = Array.isArray(body.tasks)
      ? (body.tasks as Array<{ name?: string; description?: string; dependencies?: string[] }>).map((task) => ({
          name: typeof task.name === 'string' && task.name.trim() ? task.name.trim() : 'Unnamed task',
          description: typeof task.description === 'string' && task.description.trim() ? task.description.trim() : '',
          dependencies: Array.isArray(task.dependencies) ? task.dependencies.filter(Boolean) : [],
        }))
      : [];
    const plan = await this.intelligenceService.buildOperationalPlan({
      objective,
      affectedComponents: Array.isArray(body.affectedComponents) ? (body.affectedComponents as string[]).filter(Boolean) : [],
      tasks,
      dependencies: Array.isArray(body.dependencies) ? (body.dependencies as string[]).filter(Boolean) : [],
      verificationRequirements: Array.isArray(body.verificationRequirements) ? (body.verificationRequirements as string[]).filter(Boolean) : [],
      abortOrRollbackCriteria: Array.isArray(body.abortOrRollbackCriteria) ? (body.abortOrRollbackCriteria as string[]).filter(Boolean) : [],
    } as Parameters<ElevaBusinessIntelligenceService['buildOperationalPlan']>[0]);

    const operationalPlan = plan as OperationalPlan;
    return {
      planId: operationalPlan.planId,
      objective: operationalPlan.objective,
      m6ApprovalRequired: operationalPlan.m6ApprovalRequired,
      approvalStatus: operationalPlan.approvalStatus,
    };
  }

  @Get('situations')
  @UseGuards(JwtAuthGuard, RbacPermissionGuard)
  @RequirePermission('read', 'agent')
  async getSituations(@CurrentUser() request: AuthenticatedRequest): Promise<Record<string, unknown>[]> {
    if (!request.user) {
      throw new BadRequestException('Authenticated user is required for situation visibility.');
    }

    const context = await this.intelligenceService.getBusinessIntelligenceContext();
    return (context.m7Situations as unknown) as Record<string, unknown>[];
  }
}
