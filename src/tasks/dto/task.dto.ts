import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BillingMode, Status } from '@prisma/client';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Min,
} from 'class-validator';

export class CreateTaskDto {
  @ApiProperty() @IsUUID() projectId!: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() parentTaskId?: string;
  @ApiProperty() @IsString() @Length(1, 200) title!: string;

  @ApiPropertyOptional({ enum: Status }) @IsOptional() @IsEnum(Status) status?: Status;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() urgent?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) estimateSeconds?: number;
  @ApiPropertyOptional({ enum: BillingMode }) @IsOptional() @IsEnum(BillingMode) billingMode?: BillingMode;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) hourlyRateCents?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) taskPriceCents?: number;
  @ApiPropertyOptional() @IsOptional() @IsDateString() dueDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsObject() description?: Record<string, unknown>;
}

export class UpdateTaskDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(1, 200) title?: string;
  @ApiPropertyOptional({ enum: Status }) @IsOptional() @IsEnum(Status) status?: Status;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() urgent?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) estimateSeconds?: number | null;
  @ApiPropertyOptional({ enum: BillingMode }) @IsOptional() @IsEnum(BillingMode) billingMode?: BillingMode;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) hourlyRateCents?: number | null;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) taskPriceCents?: number | null;
  @ApiPropertyOptional() @IsOptional() @IsDateString() dueDate?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsObject() description?: Record<string, unknown>;
  @ApiPropertyOptional() @IsOptional() @IsUUID() parentTaskId?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsInt() position?: number;
}

export class SetStatusDto {
  @ApiProperty({ enum: Status }) @IsEnum(Status) status!: Status;
}

export class ReorderDto {
  @ApiProperty() @IsInt() position!: number;
  @ApiPropertyOptional() @IsOptional() @IsUUID() parentTaskId?: string | null;
}
