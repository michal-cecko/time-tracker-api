import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { ProjectsModule } from './projects/projects.module';
import { TasksModule } from './tasks/tasks.module';
import { TimeEntriesModule } from './time-entries/time-entries.module';
import { ActivityModule } from './activity/activity.module';
import { SyncModule } from './sync/sync.module';
import { ReportsModule } from './reports/reports.module';
import { RealtimeModule } from './realtime/realtime.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    LoggerModule.forRoot({
      pinoHttp: {
        transport: process.env.NODE_ENV === 'production'
          ? undefined
          : { target: 'pino-pretty', options: { singleLine: true } },
      },
    }),
    PrismaModule,
    RealtimeModule,
    AuthModule,
    UsersModule,
    ProjectsModule,
    TasksModule,
    TimeEntriesModule,
    ActivityModule,
    SyncModule,
    ReportsModule,
  ],
})
export class AppModule {}
