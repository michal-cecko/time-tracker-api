import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { TasksService } from './tasks.service';
import { CreateTaskDto, ReorderDto, SetStatusDto, UpdateTaskDto } from './dto/task.dto';

@ApiTags('tasks')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller({ version: '1' })
export class TasksController {
  constructor(private tasks: TasksService) {}

  @Get('projects/:id/tasks')
  listForProject(@CurrentUser() user: AuthUser, @Param('id') projectId: string) {
    return this.tasks.listForProject(user.id, projectId);
  }

  @Get('tasks/:id')
  getOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.tasks.getOne(user.id, id);
  }

  @Post('tasks')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateTaskDto) {
    return this.tasks.create(user.id, dto);
  }

  @Patch('tasks/:id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateTaskDto) {
    return this.tasks.update(user.id, id, dto);
  }

  @Post('tasks/:id/status')
  setStatus(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: SetStatusDto) {
    return this.tasks.setStatus(user.id, id, dto);
  }

  @Post('tasks/:id/reorder')
  reorder(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: ReorderDto) {
    return this.tasks.reorder(user.id, id, dto);
  }

  @Delete('tasks/:id')
  @HttpCode(204)
  async remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    await this.tasks.remove(user.id, id);
  }
}
