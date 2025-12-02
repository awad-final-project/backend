import { Injectable, Logger, HttpException, HttpStatus, BadRequestException } from '@nestjs/common';
import { AttachmentModel } from '../../libs/database/src/models';
import { S3Service } from '../storage/s3.service';
import { v4 as uuidv4 } from 'uuid';

export interface UploadedAttachment {
  attachmentId: string;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  s3Key: string;
  s3Bucket: string;
  downloadUrl: string;
}

@Injectable()
export class AttachmentService {
  private readonly logger = new Logger(AttachmentService.name);

  constructor(
    private readonly attachmentModel: AttachmentModel,
    private readonly s3Service: S3Service,
  ) {}

  /**
   * Upload an attachment and save metadata to database
   */
  async uploadAttachment(
    file: Express.Multer.File,
    emailId?: string,
  ): Promise<UploadedAttachment> {
    this.logger.log(`uploadAttachment called, file: ${file ? 'exists' : 'null'}`);
    
    // Validate file
    if (!file) {
      this.logger.error('No file provided in uploadAttachment');
      throw new BadRequestException('No file provided');
    }

    this.logger.log(`File details: originalname=${file.originalname}, size=${file.size}, mimetype=${file.mimetype}, buffer=${file.buffer ? 'exists' : 'null'}`);

    if (!file.buffer || file.buffer.length === 0) {
      this.logger.error('Empty file buffer');
      throw new BadRequestException('Empty file provided');
    }

    if (!file.originalname) {
      this.logger.error('File has no name');
      throw new BadRequestException('File must have a name');
    }

    this.logger.log(`Uploading attachment: ${file.originalname}, size: ${file.size}, type: ${file.mimetype}`);

    try {
      // Upload to S3 (will handle gracefully if S3 is not configured)
      const uploadResult = await this.s3Service.uploadFile(
        file.buffer,
        {
          filename: file.originalname,
          mimeType: file.mimetype || 'application/octet-stream',
          size: file.size,
        },
        'attachments',
      );

      this.logger.log(`S3 upload result: key=${uploadResult.key}, bucket=${uploadResult.bucket}`);

      // Save metadata to database
      const attachment = await this.attachmentModel.save({
        filename: uuidv4() + '-' + file.originalname,
        originalName: file.originalname,
        mimeType: file.mimetype || 'application/octet-stream',
        size: file.size,
        s3Key: uploadResult.key,
        s3Bucket: uploadResult.bucket,
        emailId: emailId || 'pending',
        uploadedAt: new Date(),
      });

      this.logger.log(`Attachment saved to DB: ${attachment._id}`);

      return {
        attachmentId: attachment._id.toString(),
        filename: attachment.filename,
        originalName: attachment.originalName,
        mimeType: attachment.mimeType,
        size: attachment.size,
        s3Key: attachment.s3Key,
        s3Bucket: attachment.s3Bucket,
        downloadUrl: uploadResult.url,
      };
    } catch (error) {
      this.logger.error(`Failed to upload attachment: ${error.message}`, error.stack);
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new HttpException(
        `Failed to upload attachment: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Upload multiple attachments
   */
  async uploadMultipleAttachments(
    files: Express.Multer.File[],
    emailId?: string,
  ): Promise<UploadedAttachment[]> {
    if (!files || files.length === 0) {
      throw new BadRequestException('No files provided');
    }
    return Promise.all(files.map((file) => this.uploadAttachment(file, emailId)));
  }

  /**
   * Get attachment by ID
   */
  async getAttachmentById(attachmentId: string): Promise<UploadedAttachment | null> {
    const attachment = await this.attachmentModel.findByIdString(attachmentId);
    if (!attachment) {
      return null;
    }

    const downloadUrl = await this.s3Service.getSignedDownloadUrl(attachment.s3Key);

    return {
      attachmentId: attachment._id.toString(),
      filename: attachment.filename,
      originalName: attachment.originalName,
      mimeType: attachment.mimeType,
      size: attachment.size,
      s3Key: attachment.s3Key,
      s3Bucket: attachment.s3Bucket,
      downloadUrl,
    };
  }

  /**
   * Get all attachments for an email
   */
  async getAttachmentsByEmailId(emailId: string): Promise<UploadedAttachment[]> {
    const attachments = await this.attachmentModel.findByEmailId(emailId);

    return Promise.all(
      attachments.map(async (attachment) => {
        const downloadUrl = await this.s3Service.getSignedDownloadUrl(attachment.s3Key);
        return {
          attachmentId: attachment._id.toString(),
          filename: attachment.filename,
          originalName: attachment.originalName,
          mimeType: attachment.mimeType,
          size: attachment.size,
          s3Key: attachment.s3Key,
          s3Bucket: attachment.s3Bucket,
          downloadUrl,
        };
      }),
    );
  }

  /**
   * Download attachment content
   */
  async downloadAttachment(attachmentId: string): Promise<{
    stream: any;
    filename: string;
    mimeType: string;
    size: number;
  }> {
    const attachment = await this.attachmentModel.findByIdString(attachmentId);
    if (!attachment) {
      throw new HttpException('Attachment not found', HttpStatus.NOT_FOUND);
    }

    const { stream } = await this.s3Service.getFile(attachment.s3Key);

    return {
      stream,
      filename: attachment.originalName,
      mimeType: attachment.mimeType,
      size: attachment.size,
    };
  }

  /**
   * Get signed download URL for an attachment
   */
  async getDownloadUrl(attachmentId: string, expiresIn: number = 3600): Promise<string> {
    const attachment = await this.attachmentModel.findByIdString(attachmentId);
    if (!attachment) {
      throw new HttpException('Attachment not found', HttpStatus.NOT_FOUND);
    }

    return this.s3Service.getSignedDownloadUrl(attachment.s3Key, expiresIn);
  }

  /**
   * Delete an attachment
   */
  async deleteAttachment(attachmentId: string): Promise<void> {
    const attachment = await this.attachmentModel.findByIdString(attachmentId);
    if (!attachment) {
      throw new HttpException('Attachment not found', HttpStatus.NOT_FOUND);
    }

    // Delete from S3
    await this.s3Service.deleteFile(attachment.s3Key);

    // Delete from database
    await this.attachmentModel.deleteByIdString(attachmentId);

    this.logger.log(`Attachment deleted: ${attachmentId}`);
  }

  /**
   * Delete all attachments for an email
   */
  async deleteAttachmentsByEmailId(emailId: string): Promise<void> {
    const attachments = await this.attachmentModel.findByEmailId(emailId);

    // Delete from S3
    const s3Keys = attachments.map((att) => att.s3Key);
    if (s3Keys.length > 0) {
      await this.s3Service.deleteFiles(s3Keys);
    }

    // Delete from database
    await this.attachmentModel.deleteByEmailId(emailId);

    this.logger.log(`Deleted ${attachments.length} attachments for email: ${emailId}`);
  }

  /**
   * Update attachment's email ID (when email is saved after attachments are uploaded)
   */
  async linkAttachmentsToEmail(attachmentIds: string[], emailId: string): Promise<void> {
    for (const attachmentId of attachmentIds) {
      await this.attachmentModel.updateOne(
        { _id: attachmentId } as any,
        { emailId },
      );
    }
    this.logger.log(`Linked ${attachmentIds.length} attachments to email: ${emailId}`);
  }

  /**
   * Get attachment content as Buffer (for sending emails)
   */
  async getAttachmentContent(attachmentId: string): Promise<{
    content: Buffer;
    filename: string;
    mimeType: string;
  }> {
    const attachment = await this.attachmentModel.findByIdString(attachmentId);
    if (!attachment) {
      throw new HttpException('Attachment not found', HttpStatus.NOT_FOUND);
    }

    const { stream } = await this.s3Service.getFile(attachment.s3Key);

    // Convert stream to buffer
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }
    const content = Buffer.concat(chunks);

    return {
      content,
      filename: attachment.originalName,
      mimeType: attachment.mimeType,
    };
  }
}
