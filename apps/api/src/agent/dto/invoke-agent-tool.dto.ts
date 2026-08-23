import { IsIn, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';
import { INVOCABLE_AGENT_TOOLS } from '../agent-tools';

export class InvokeAgentToolDto {
  @IsString()
  @IsIn([...INVOCABLE_AGENT_TOOLS])
  tool!: string;

  @IsOptional()
  @IsObject()
  args?: Record<string, unknown>;
}

export class DecideAgentActionDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reason?: string;
}

export class CreateAgentSessionDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;
}
