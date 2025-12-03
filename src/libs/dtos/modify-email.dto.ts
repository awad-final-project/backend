import { IsOptional, IsBoolean } from 'class-validator';

export class ModifyEmailDto {
  @IsOptional()
  @IsBoolean()
  isRead?: boolean;

  @IsOptional()
  @IsBoolean()
  isStarred?: boolean;

  @IsOptional()
  @IsBoolean()
  delete?: boolean;
}

