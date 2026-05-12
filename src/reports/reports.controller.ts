import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsDateString, IsOptional } from 'class-validator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AuthUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { ReportsService } from './reports.service';

class WeeklyQuery {
  @ApiPropertyOptional() @IsOptional() @IsDateString() from?: string;
}

class RangeQuery {
  @ApiPropertyOptional() @IsDateString() from!: string;
  @ApiPropertyOptional() @IsDateString() to!: string;
}

@ApiTags('reports')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller({ path: 'reports', version: '1' })
export class ReportsController {
  constructor(private reports: ReportsService) {}

  @Get('weekly')
  weekly(@CurrentUser() user: AuthUser, @Query() q: WeeklyQuery) {
    return this.reports.weekly(user.id, q.from);
  }

  @Get('range')
  range(@CurrentUser() user: AuthUser, @Query() q: RangeQuery) {
    return this.reports.range(user.id, q.from, q.to);
  }
}
