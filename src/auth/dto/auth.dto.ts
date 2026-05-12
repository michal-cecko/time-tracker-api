import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class RegisterDto {
  @ApiProperty() @IsEmail() email!: string;
  @ApiProperty() @IsString() @MinLength(8) password!: string;
  @ApiProperty() @IsString() name!: string;
}

export class LoginDto {
  @ApiProperty() @IsEmail() email!: string;
  @ApiProperty() @IsString() password!: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() staysLoggedIn?: boolean;
}

export class RefreshDto {
  @ApiProperty() @IsString() refreshToken!: string;
}

export class ForgotDto {
  @ApiProperty() @IsEmail() email!: string;
}

export class ResetDto {
  @ApiProperty() @IsString() token!: string;
  @ApiProperty() @IsString() @MinLength(8) password!: string;
}
