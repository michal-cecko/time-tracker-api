import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBooleanString, IsDateString, IsInt, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class StartTimerDto {
  // Optional: an unassigned timer can be categorised later via PATCH.
  @ApiPropertyOptional() @IsOptional() @IsUUID() taskId?: string;
  // Optional client-supplied timestamp — the offline outbox sets this when a
  // queued start/stop is replayed late, so the recorded entry preserves the
  // moment the user actually tapped Play.
  @ApiPropertyOptional() @IsOptional() @IsDateString() startedAt?: string;
}

export class StopTimerDto {
  // Which running timer to stop. Multiple timers can run concurrently (one per
  // task), so a stop must name its target. Omitted → stop the most recently
  // started timer (back-compat for the single-timer clients).
  @ApiPropertyOptional() @IsOptional() @IsUUID() entryId?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() endedAt?: string;
}

export class ManualEntryDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID() taskId?: string;
  @ApiProperty() @IsDateString() startedAt!: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() endedAt?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) durationSeconds?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
}

export class UpdateEntryDto {
  // Assign / re-assign / unassign (null) the entry's task post-hoc.
  @ApiPropertyOptional() @IsOptional() taskId?: string | null;
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
