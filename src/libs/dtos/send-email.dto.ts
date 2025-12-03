import { IsEmail, IsNotEmpty, IsString, IsOptional, IsArray } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AttachmentDto {
  @ApiProperty({ description: 'Attachment ID from upload' })
  @IsString()
  @IsNotEmpty()
  attachmentId: string;

  @ApiProperty({ description: 'Original filename' })
  @IsString()
  @IsNotEmpty()
  filename: string;

  @ApiProperty({ description: 'MIME type of the file' })
  @IsString()
  @IsNotEmpty()
  mimeType: string;

  @ApiProperty({ description: 'File size in bytes' })
  @IsNotEmpty()
  size: number;

  @ApiProperty({ description: 'S3 key for the file' })
  @IsString()
  @IsNotEmpty()
  s3Key: string;
}

export class SendEmailDto {
  @ApiProperty({ description: 'Recipient email address' })
  @IsEmail()
  @IsNotEmpty()
  to: string;

  @ApiPropertyOptional({ description: 'CC recipients', type: [String] })
  @IsArray()
  @IsEmail({}, { each: true })
  @IsOptional()
  cc?: string[];

  @ApiPropertyOptional({ description: 'BCC recipients', type: [String] })
  @IsArray()
  @IsEmail({}, { each: true })
  @IsOptional()
  bcc?: string[];

  @ApiProperty({ description: 'Email subject' })
  @IsString()
  @IsNotEmpty()
  subject: string;

  @ApiProperty({ description: 'Email body content' })
  @IsString()
  @IsNotEmpty()
  body: string;

  @ApiPropertyOptional({ description: 'HTML body content' })
  @IsString()
  @IsOptional()
  htmlBody?: string;

  @ApiPropertyOptional({ description: 'Reply to message ID' })
  @IsString()
  @IsOptional()
  inReplyTo?: string;

  @ApiPropertyOptional({ description: 'Attachments array', type: [AttachmentDto] })
  @IsArray()
  @IsOptional()
  attachments?: AttachmentDto[];
}
