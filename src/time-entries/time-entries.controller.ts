import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { TimeEntriesService } from './time-entries.service';
import { HistoryQuery, ListPerTaskQuery, ManualEntryDto, StartTimerDto, UpdateEntryDto } from './dto/time-entry.dto';

@ApiTags('time-entries')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller({ version: '1' })
export class TimeEntriesController {
  constructor(private entries: TimeEntriesService) {}

  @Post('time-entries/start')
  @HttpCode(200)
  start(@CurrentUser() user: AuthUser, @Body() dto: StartTimerDto) {
    return this.entries.start(user.id, dto);
  }

  @Post('time-entries/stop')
  @HttpCode(200)
  stop(@CurrentUser() user: AuthUser) {
    return this.entries.stop(user.id);
  }

  @Get('time-entries/running')
  running(@CurrentUser() user: AuthUser) {
    return this.entries.runningEntry(user.id);
  }

  @Post('time-entries')
  manual(@CurrentUser() user: AuthUser, @Body() dto: ManualEntryDto) {
    return this.entries.manual(user.id, dto);
  }

  @Patch('time-entries/:id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateEntryDto) {
    return this.entries.update(user.id, id, dto);
  }

  @Delete('time-entries/:id')
  @HttpCode(204)
  async remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    await this.entries.remove(user.id, id);
  }

  @Get('tasks/:id/time-entries')
  listForTask(@CurrentUser() user: AuthUser, @Param('id') taskId: string, @Query() q: ListPerTaskQuery) {
    return this.entries.listForTask(user.id, taskId, q);
  }

  @Get('time-entries')
  history(@CurrentUser() user: AuthUser, @Query() q: HistoryQuery) {
    return this.entries.history(user.id, q);
  }
}
