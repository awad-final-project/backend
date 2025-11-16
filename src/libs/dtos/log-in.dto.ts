import { ApiProperty } from '@nestjs/swagger';
import { IsEmail } from 'class-validator';

export class LogInDto {
  @ApiProperty()
  @IsEmail({}, { message: 'Invalid email' })
  email: string;

  @ApiProperty()
  password: string;
}
