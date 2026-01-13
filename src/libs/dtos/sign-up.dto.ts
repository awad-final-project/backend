import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength, Matches } from 'class-validator';

export class SignUpDto {
  @ApiProperty({ description: 'Username (will be used to create email: username@hkt.com)' })
  @IsString()
  @MinLength(3, { message: 'Username must be at least 3 characters' })
  @Matches(/^[a-zA-Z0-9_]+$/, { message: 'Username can only contain letters, numbers and underscores' })
  username: string;

  @ApiProperty()
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  password: string;
}
