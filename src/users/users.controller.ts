import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { UsersService } from './users.service';
import { UpdateMeDto, UpdateSettingsDto } from './dto/users.dto';

@ApiTags('users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller({ path: 'me', version: '1' })
export class UsersController {
  constructor(private users: UsersService) {}

  @Get()
  me(@CurrentUser() user: AuthUser) {
    return this.users.me(user.id);
  }

  @Patch()
  update(@CurrentUser() user: AuthUser, @Body() dto: UpdateMeDto) {
    return this.users.updateMe(user.id, dto);
  }

  @Patch('settings')
  settings(@CurrentUser() user: AuthUser, @Body() dto: UpdateSettingsDto) {
    return this.users.updateSettings(user.id, dto);
  }
}
