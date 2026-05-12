import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AuthUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { SyncService } from './sync.service';
import { SyncBatchDto } from './dto/sync.dto';

@ApiTags('sync')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller({ path: 'sync', version: '1' })
export class SyncController {
  constructor(private sync: SyncService) {}

  @Post('batch')
  batch(@CurrentUser() user: AuthUser, @Body() dto: SyncBatchDto) {
    return this.sync.apply(user.id, dto);
  }

  @Get('pending')
  pending(@CurrentUser() user: AuthUser) {
    return this.sync.pending(user.id);
  }
}
