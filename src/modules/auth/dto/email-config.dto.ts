import { IsEmail, IsString, MinLength, IsEnum, IsOptional, IsNumber } from 'class-validator';

export class SaveEmailConfigDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(1)
  password: string;

  @IsEnum(['gmail', 'outlook', 'yahoo', 'other'])
  provider: 'gmail' | 'outlook' | 'yahoo' | 'other';

  @IsOptional()
  @IsString()
  imapHost?: string;

  @IsOptional()
  @IsNumber()
  imapPort?: number;

  @IsOptional()
  @IsString()
  smtpHost?: string;

  @IsOptional()
  @IsNumber()
  smtpPort?: number;
}

export class EmailConfigResponseDto {
  email: string;
  provider: string;
  isConfigured: boolean;
  lastVerified?: Date;
}
