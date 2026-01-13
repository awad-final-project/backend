import { IsString, IsOptional, IsNumber, IsBoolean } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateColumnDto {
  @ApiProperty({ example: 'todo', description: 'Unique column ID' })
  @IsString()
  id: string;

  @ApiProperty({ example: 'To Do', description: 'Column title' })
  @IsString()
  title: string;

  @ApiPropertyOptional({ example: 'Tasks to be done', description: 'Column description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: 0, description: 'Column position/order' })
  @IsOptional()
  @IsNumber()
  position?: number;

  @ApiPropertyOptional({ example: 'TODO', description: 'Gmail label to sync with' })
  @IsOptional()
  @IsString()
  gmailLabel?: string;

  @ApiPropertyOptional({ example: '#3b82f6', description: 'Column color' })
  @IsOptional()
  @IsString()
  color?: string;

  @ApiPropertyOptional({ example: 'todo', description: 'Email label used for label-based Kanban' })
  @IsOptional()
  @IsString()
  label?: string;
}

export class UpdateColumnDto {
  @ApiPropertyOptional({ example: 'To Do Updated', description: 'Column title' })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({ example: 'Updated description', description: 'Column description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: 1, description: 'Column position/order' })
  @IsOptional()
  @IsNumber()
  position?: number;

  @ApiPropertyOptional({ example: 'TODO_UPDATED', description: 'Gmail label to sync with' })
  @IsOptional()
  @IsString()
  gmailLabel?: string;

  @ApiPropertyOptional({ example: '#ef4444', description: 'Column color' })
  @IsOptional()
  @IsString()
  color?: string;

  @ApiPropertyOptional({ example: 'todo', description: 'Email label used for label-based Kanban' })
  @IsOptional()
  @IsString()
  label?: string;
}

export class MoveCardDto {
  @ApiProperty({ example: 'email123', description: 'Email ID to move' })
  @IsString()
  emailId: string;

  @ApiProperty({ example: 'inbox', description: 'Source column ID' })
  @IsString()
  fromColumn: string;

  @ApiProperty({ example: 'todo', description: 'Target column ID' })
  @IsString()
  toColumn: string;

  @ApiPropertyOptional({ example: 0, description: 'Position in target column' })
  @IsOptional()
  @IsNumber()
  position?: number;
}

export class InitializeKanbanDto {
  @ApiPropertyOptional({ description: 'List of email IDs to initialize on board' })
  @IsOptional()
  emailIds?: string[];
}
