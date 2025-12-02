import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
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
import { EmailService } from './email.service';
import { AttachmentService } from './attachment.service';
import { JwtAuthGuard } from '../../libs/guards/jwt-auth.guard';
import { CurrentUser } from '../../libs/decorators';
import { SendEmailDto } from '../../libs/dtos';

// Multer config for serverless environment
const multerOptions = {
  storage: memoryStorage(),
  limits: {
    fileSize: 25 * 1024 * 1024, // 25MB max file size
  },
};

@ApiTags('Emails')
@Controller('emails')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class EmailController {
  constructor(
    private readonly emailService: EmailService,
    private readonly attachmentService: AttachmentService,
  ) {}

  // ==================== Static Routes First ====================

  @Get('mailboxes')
  @ApiOperation({ summary: 'Get all mailboxes with unread counts' })
  async getMailboxes(@CurrentUser() user: { userId: string }) {
    return this.emailService.getMailboxes(user.userId);
  }

  @Post('send')
  @ApiOperation({ summary: 'Send an email with optional attachments' })
  async sendEmail(
    @CurrentUser() user: { userId: string; email: string },
    @Body() data: SendEmailDto,
  ) {
    return this.emailService.sendEmail(user.userId, user.email, data);
  }

  @Post('seed')
  @ApiOperation({ summary: 'Seed mock emails for testing' })
  async seedMockEmails(@CurrentUser() user: { userId: string; email: string }) {
    return this.emailService.seedMockEmails(user.userId, user.email);
  }

  // ==================== Attachment Endpoints (before :id routes) ====================

  @Post('attachments/upload')
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
  async uploadAttachment(
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('No file provided');
    }
    return this.attachmentService.uploadAttachment(file);
  }

  @Post('attachments/upload-multiple')
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
  async uploadMultipleAttachments(
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    if (!files || files.length === 0) {
      throw new BadRequestException('No files provided');
    }
    return this.attachmentService.uploadMultipleAttachments(files);
  }

  @Get('attachments/:attachmentId')
  @ApiOperation({ summary: 'Get attachment metadata' })
  async getAttachment(
    @Param('attachmentId') attachmentId: string,
  ) {
    return this.attachmentService.getAttachmentById(attachmentId);
  }

  @Get('attachments/:attachmentId/download')
  @ApiOperation({ summary: 'Download attachment file' })
  async downloadAttachment(
    @Param('attachmentId') attachmentId: string,
    @Res() res: Response,
  ) {
    const { stream, filename, mimeType, size } = await this.attachmentService.downloadAttachment(attachmentId);

    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    res.setHeader('Content-Length', size);

    stream.pipe(res);
  }

  @Get('attachments/:attachmentId/url')
  @ApiOperation({ summary: 'Get signed download URL for attachment' })
  async getDownloadUrl(
    @Param('attachmentId') attachmentId: string,
    @Query('expiresIn') expiresIn?: string,
  ) {
    const expires = expiresIn ? parseInt(expiresIn, 10) : 3600;
    const url = await this.attachmentService.getDownloadUrl(attachmentId, expires);
    return { url, expiresIn: expires };
  }

  @Delete('attachments/:attachmentId')
  @ApiOperation({ summary: 'Delete an attachment' })
  async deleteAttachment(
    @Param('attachmentId') attachmentId: string,
  ) {
    await this.attachmentService.deleteAttachment(attachmentId);
    return { message: 'Attachment deleted successfully' };
  }

  // ==================== Folder Routes ====================

  @Get('folder/:folder')
  @ApiOperation({ summary: 'Get emails by folder' })
  async getEmailsByFolder(
    @CurrentUser() user: { userId: string },
    @Param('folder') folder: string,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '50',
  ) {
    return this.emailService.getEmailsByFolder(
      user.userId,
      folder,
      parseInt(page, 10),
      parseInt(limit, 10),
    );
  }

  // ==================== Dynamic :id Routes (MUST be last) ====================

  @Get(':id')
  @ApiOperation({ summary: 'Get email by ID with full details' })
  async getEmailById(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
  ) {
    return this.emailService.getEmailById(user.userId, id);
  }

  @Patch(':id/star')
  @ApiOperation({ summary: 'Toggle star status of an email' })
  async toggleStar(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
  ) {
    return this.emailService.toggleStar(user.userId, id);
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Mark email as read/unread' })
  async markAsRead(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body('isRead') isRead: boolean,
  ) {
    return this.emailService.markAsRead(user.userId, id, isRead);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete an email' })
  async deleteEmail(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
  ) {
    return this.emailService.deleteEmail(user.userId, id);
  }

  @Get(':emailId/attachments')
  @ApiOperation({ summary: 'Get all attachments for an email' })
  async getEmailAttachments(
    @Param('emailId') emailId: string,
  ) {
    return this.attachmentService.getAttachmentsByEmailId(emailId);
  }
}
