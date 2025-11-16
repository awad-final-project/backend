import { ApiProperty } from '@nestjs/swagger';
import { LogInDto } from './log-in.dto';
import { IsString } from 'class-validator';

export class SignUpDto extends LogInDto {
  @ApiProperty()
  @IsString()
  username: string;
}
