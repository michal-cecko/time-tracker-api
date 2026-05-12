import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AuthUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { ActivityService } from './activity.service';
import { IsInt, IsOptional, IsUUID, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

class ActivityQuery {
  @ApiPropertyOptional() @IsOptional() @IsUUID() taskId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() projectId?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(1) limit?: number;
}

@ApiTags('activity')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller({ path: 'activity', version: '1' })
export class ActivityController {
  constructor(private activity: ActivityService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() q: ActivityQuery) {
    return this.activity.list(user.id, q);
  }
}
