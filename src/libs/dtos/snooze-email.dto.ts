import { IsDateString, IsNotEmpty, IsOptional, IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SnoozeEmailDto {
  @ApiProperty({
    description: 'ISO date string for when the email should be unsnoozed',
    example: '2025-12-11T10:00:00.000Z',
  })
  @IsNotEmpty()
  @IsDateString()
  snoozeUntil: string;
}

export enum SnoozePreset {
  LATER_TODAY = 'later_today',
  TOMORROW = 'tomorrow',
  THIS_WEEKEND = 'this_weekend',
  NEXT_WEEK = 'next_week',
  CUSTOM = 'custom',
}

export class SnoozeEmailPresetDto {
  @ApiProperty({
    description: 'Preset snooze option',
    enum: SnoozePreset,
    example: SnoozePreset.TOMORROW,
  })
  @IsNotEmpty()
  @IsEnum(SnoozePreset)
  preset: SnoozePreset;

  @ApiProperty({
    description: 'Custom date/time (required if preset is CUSTOM)',
    example: '2025-12-15T14:30:00.000Z',
    required: false,
  })
  @IsOptional()
  @IsDateString()
  customDate?: string;
}

export class SummarizeEmailDto {
  @ApiProperty({
    description: 'Email ID to summarize',
    example: '507f1f77bcf86cd799439011',
  })
  @IsNotEmpty()
  emailId: string;
}
