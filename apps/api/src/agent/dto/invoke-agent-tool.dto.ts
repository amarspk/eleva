import { IsIn, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';
import { SAFE_AGENT_TOOLS } from '../agent-tools';

export class InvokeAgentToolDto {
  @IsString()
  @IsIn([...SAFE_AGENT_TOOLS])
  tool!: string;

  @IsOptional()
  @IsObject()
  args?: Record<string, unknown>;
}

export class CreateAgentSessionDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;
}
