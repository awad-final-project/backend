import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Res,
  UploadedFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { ApiTags, ApiOperation, ApiConsumes, ApiBody, ApiBearerAuth } from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { AttachmentService } from './attachment.service';
import { JwtAuthGuard } from '@app/libs/guards/jwt-auth.guard';
import { CurrentUser } from '@app/libs/decorators';

// Multer config for serverless environment
const multerOptions = {
  storage: memoryStorage(),
  limits: {
    fileSize: 25 * 1024 * 1024, // 25MB max file size
  },
};

@ApiTags('Attachments')
@Controller('emails/attachments')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class AttachmentController {
  constructor(private readonly attachmentService: AttachmentService) {}

  @Post('upload')
  @ApiOperation({ summary: 'Upload a single attachment' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @UseInterceptors(FileInterceptor('file', multerOptions))
  async uploadAttachment(@UploadedFile() file: any) {
    if (!file) {
      throw new BadRequestException('No file provided');
    }
    return this.attachmentService.uploadAttachment(file);
  }

  @Post('upload-multiple')
  @ApiOperation({ summary: 'Upload multiple attachments' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        files: {
          type: 'array',
          items: {
            type: 'string',
            format: 'binary',
          },
        },
      },
    },
  })
  @UseInterceptors(FilesInterceptor('files', 10, multerOptions))
  async uploadMultipleAttachments(@UploadedFiles() files: any[]) {
    if (!files || files.length === 0) {
      throw new BadRequestException('No files provided');
    }
    return this.attachmentService.uploadMultipleAttachments(files);
  }

  @Get(':attachmentId')
  @ApiOperation({ summary: 'Get attachment metadata' })
  async getAttachment(@Param('attachmentId') attachmentId: string) {
    return this.attachmentService.getAttachmentById(attachmentId);
  }

  @Get(':attachmentId/download')
  @ApiOperation({ summary: 'Download attachment file' })
  async downloadAttachment(
    @Param('attachmentId') attachmentId: string,
    @Res() res: Response,
  ) {
    const result = await this.attachmentService.downloadAttachment(attachmentId);

    res.setHeader('Content-Type', result.mimeType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(result.filename)}"`,
    );
    res.setHeader('Content-Length', result.size);

    if (result.storageType === 'DATABASE' && result.buffer) {
      // Send buffer directly for database-stored files
      res.send(result.buffer);
    } else if (result.stream) {
      // Pipe stream for S3-stored files
      result.stream.pipe(res);
    } else {
      res.status(404).send('File not found');
    }
  }

  @Get(':attachmentId/url')
  @ApiOperation({ summary: 'Get signed download URL for attachment' })
  async getDownloadUrl(
    @Param('attachmentId') attachmentId: string,
    @Query('expiresIn') expiresIn?: string,
  ) {
    const expires = expiresIn ? parseInt(expiresIn, 10) : 3600;
    const url = await this.attachmentService.getDownloadUrl(attachmentId, expires);
    return { url, expiresIn: expires };
  }

  @Delete(':attachmentId')
  @ApiOperation({ summary: 'Delete an attachment' })
  async deleteAttachment(@Param('attachmentId') attachmentId: string) {
    await this.attachmentService.deleteAttachment(attachmentId);
    return { message: 'Attachment deleted successfully' };
  }

  @Get('gmail/:emailId/:attachmentId/download')
  @ApiOperation({ summary: 'Download Gmail attachment' })
  async downloadGmailAttachment(
    @CurrentUser() user: { userId: string },
    @Param('emailId') emailId: string,
    @Param('attachmentId') attachmentId: string,
    @Res() res: Response,
  ) {
    const result = await this.attachmentService.downloadGmailAttachment(user.userId, emailId, attachmentId);

    res.setHeader('Content-Type', result.mimeType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(result.filename)}"`,
    );
    res.setHeader('Content-Length', result.size);

    res.send(result.buffer);
  }
}
