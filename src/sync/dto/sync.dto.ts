import { ApiProperty } from '@nestjs/swagger';
import { SyncKind } from '@prisma/client';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsEnum, IsObject, IsString, ValidateNested } from 'class-validator';

export class SyncItemDto {
  @ApiProperty() @IsString() id!: string;
  @ApiProperty({ enum: SyncKind }) @IsEnum(SyncKind) kind!: SyncKind;
  @ApiProperty() @IsObject() payload!: Record<string, unknown>;
}

export class SyncBatchDto {
  @ApiProperty({ type: [SyncItemDto] })
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => SyncItemDto)
  items!: SyncItemDto[];
}
