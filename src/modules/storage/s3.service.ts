import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v4 as uuidv4 } from 'uuid';
import { Readable } from 'stream';

export interface UploadResult {
  key: string;
  bucket: string;
  url: string;
}

export interface FileMetadata {
  filename: string;
  mimeType: string;
  size: number;
}

@Injectable()
export class S3Service {
  private readonly logger = new Logger(S3Service.name);
  private readonly s3Client: S3Client | null = null;
  private readonly bucket: string;
  private readonly region: string;
  private readonly isConfigured: boolean;

  constructor(private readonly configService: ConfigService) {
    this.region = this.configService.get<string>('AWS_REGION') || 'us-east-1';
    this.bucket = this.configService.get<string>('AWS_S3_BUCKET') || 'email-attachments';

    const accessKeyId = this.configService.get<string>('AWS_ACCESS_KEY_ID');
    const secretAccessKey = this.configService.get<string>('AWS_SECRET_ACCESS_KEY');

    // Check if S3 is properly configured
    this.isConfigured = !!(accessKeyId && secretAccessKey);

    if (!this.isConfigured) {
      this.logger.warn('S3 is not configured. File uploads will be stored locally in database only.');
      return;
    }

    // Support both AWS S3 and MinIO
    const endpoint = this.configService.get<string>('S3_ENDPOINT');
    
    this.s3Client = new S3Client({
      region: this.region,
      endpoint: endpoint || undefined,
      forcePathStyle: !!endpoint, // Required for MinIO
      credentials: {
        accessKeyId: accessKeyId || '',
        secretAccessKey: secretAccessKey || '',
      },
    });
  }

  /**
   * Check if S3 is configured and available
   */
  isAvailable(): boolean {
    return this.isConfigured && this.s3Client !== null;
  }

  /**
   * Upload a file to S3
   */
  async uploadFile(
    file: Buffer,
    metadata: FileMetadata,
    folder: string = 'attachments',
  ): Promise<UploadResult> {
    const key = `${folder}/${uuidv4()}-${metadata.filename}`;

    // If S3 is not configured, return a mock result
    if (!this.isAvailable()) {
      this.logger.warn('S3 not configured, returning mock upload result');
      return {
        key,
        bucket: this.bucket,
        url: `local://${key}`,
      };
    }

    try {
      await this.s3Client!.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: file,
          ContentType: metadata.mimeType,
          ContentDisposition: `attachment; filename="${metadata.filename}"`,
          Metadata: {
            originalName: metadata.filename,
            size: metadata.size.toString(),
          },
        }),
      );

      this.logger.log(`File uploaded successfully: ${key}`);

      return {
        key,
        bucket: this.bucket,
        url: await this.getSignedDownloadUrl(key),
      };
    } catch (error) {
      this.logger.error(`Failed to upload file: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Get a file from S3
   */
  async getFile(key: string): Promise<{ stream: Readable; metadata: any }> {
    if (!this.isAvailable()) {
      throw new Error('S3 is not configured. Cannot retrieve files.');
    }

    try {
      const response = await this.s3Client!.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: key,
        }),
      );

      return {
        stream: response.Body as Readable,
        metadata: {
          contentType: response.ContentType,
          contentLength: response.ContentLength,
          contentDisposition: response.ContentDisposition,
          originalName: response.Metadata?.originalName,
        },
      };
    } catch (error) {
      this.logger.error(`Failed to get file: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Delete a file from S3
   */
  async deleteFile(key: string): Promise<void> {
    if (!this.isAvailable()) {
      this.logger.warn('S3 not configured, skipping file deletion');
      return;
    }

    try {
      await this.s3Client!.send(
        new DeleteObjectCommand({
          Bucket: this.bucket,
          Key: key,
        }),
      );
      this.logger.log(`File deleted successfully: ${key}`);
    } catch (error) {
      this.logger.error(`Failed to delete file: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Check if a file exists in S3
   */
  async fileExists(key: string): Promise<boolean> {
    if (!this.isAvailable()) {
      return false;
    }

    try {
      await this.s3Client!.send(
        new HeadObjectCommand({
          Bucket: this.bucket,
          Key: key,
        }),
      );
      return true;
    } catch (error) {
      if (error.name === 'NotFound') {
        return false;
      }
      throw error;
    }
  }

  /**
   * Get a signed URL for downloading a file (valid for 1 hour by default)
   */
  async getSignedDownloadUrl(key: string, expiresIn: number = 3600): Promise<string> {
    if (!this.isAvailable()) {
      return `local://${key}`;
    }

    try {
      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });

      return await getSignedUrl(this.s3Client!, command, { expiresIn });
    } catch (error) {
      this.logger.error(`Failed to generate signed URL: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Get a signed URL for uploading a file (valid for 1 hour by default)
   */
  async getSignedUploadUrl(
    key: string,
    mimeType: string,
    expiresIn: number = 3600,
  ): Promise<string> {
    if (!this.isAvailable()) {
      return `local://${key}`;
    }

    try {
      const command = new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ContentType: mimeType,
      });

      return await getSignedUrl(this.s3Client!, command, { expiresIn });
    } catch (error) {
      this.logger.error(`Failed to generate upload URL: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Delete multiple files from S3
   */
  async deleteFiles(keys: string[]): Promise<void> {
    await Promise.all(keys.map((key) => this.deleteFile(key)));
  }
}
