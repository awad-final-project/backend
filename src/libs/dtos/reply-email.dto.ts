import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class ReplyEmailDto {
  @IsString()
  @IsNotEmpty()
  body: string;

  @IsBoolean()
  @IsOptional()
  replyAll?: boolean;
}

