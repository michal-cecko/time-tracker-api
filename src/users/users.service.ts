import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateMeDto, UpdateSettingsDto } from './dto/users.dto';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async me(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: { settings: true },
    });
    const { passwordHash, ...safe } = user;
    return safe;
  }

  updateMe(userId: string, dto: UpdateMeDto) {
    return this.prisma.user.update({ where: { id: userId }, data: dto });
  }

  async updateSettings(userId: string, dto: UpdateSettingsDto) {
    return this.prisma.settings.upsert({
      where: { userId },
      update: dto,
      create: { userId, ...dto },
    });
  }
}
