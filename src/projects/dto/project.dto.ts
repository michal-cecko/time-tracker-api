import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsObject, IsOptional, IsString, Length, Matches } from 'class-validator';

export class CreateProjectDto {
  @ApiProperty() @IsString() @Length(1, 80) name!: string;
  @ApiProperty() @IsString() @Length(1, 3) initials!: string;
  @ApiProperty() @IsString() @Matches(/^#([0-9a-fA-F]{6})$/) colorHex!: string;
  @ApiPropertyOptional() @IsOptional() @IsObject() description?: Record<string, unknown>;
}

export class UpdateProjectDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(1, 80) name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(1, 3) initials?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Matches(/^#([0-9a-fA-F]{6})$/) colorHex?: string;
  @ApiPropertyOptional() @IsOptional() @IsObject() description?: Record<string, unknown>;
}

export class ListProjectsQuery {
  @ApiPropertyOptional({ enum: ['true', 'false', 'all'] })
  @IsOptional()
  @IsIn(['true', 'false', 'all'])
  archived?: 'true' | 'false' | 'all';
}
