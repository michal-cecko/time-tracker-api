import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBooleanString, IsDateString, IsInt, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class StartTimerDto {
  @ApiProperty() @IsUUID() taskId!: string;
}

export class ManualEntryDto {
  @ApiProperty() @IsUUID() taskId!: string;
  @ApiProperty() @IsDateString() startedAt!: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() endedAt?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) durationSeconds?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
}

export class UpdateEntryDto {
  @ApiPropertyOptional() @IsOptional() @IsDateString() startedAt?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() endedAt?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) durationSeconds?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
}

export class ListPerTaskQuery {
  @ApiPropertyOptional() @IsOptional() @IsBooleanString() descendants?: string;
}

export class HistoryQuery {
  @ApiPropertyOptional() @IsOptional() @IsDateString() from?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() to?: string;
}
