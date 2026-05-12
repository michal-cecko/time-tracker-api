import { ApiPropertyOptional } from '@nestjs/swagger';
import { Density, Theme } from '@prisma/client';
import { IsBoolean, IsEnum, IsInt, IsNumber, IsOptional, IsString, Matches, Max, Min } from 'class-validator';

export class UpdateMeDto {
  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() avatarSeed?: string;
}

export class UpdateSettingsDto {
  @ApiPropertyOptional({ enum: Theme }) @IsOptional() @IsEnum(Theme) theme?: Theme;
  @ApiPropertyOptional() @IsOptional() @IsString() @Matches(/^#([0-9a-fA-F]{6})$/) accentHex?: string;
  @ApiPropertyOptional({ enum: Density }) @IsOptional() @IsEnum(Density) density?: Density;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0.85) @Max(1.3) fontScale?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(60) idleDetectionMin?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() autoStopAtMidnight?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() pomodoroEnabled?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(5) @Max(120) pomodoroWorkMin?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(60) pomodoroBreakMin?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() remindersEnabled?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() calendarIntegration?: boolean;
}
