import { Module } from '@nestjs/common';
import { TimeEntriesService } from './time-entries.service';
import { TimeEntriesController } from './time-entries.controller';
import { TasksModule } from '../tasks/tasks.module';

@Module({
  imports: [TasksModule],
  providers: [TimeEntriesService],
  controllers: [TimeEntriesController],
  exports: [TimeEntriesService],
})
export class TimeEntriesModule {}
