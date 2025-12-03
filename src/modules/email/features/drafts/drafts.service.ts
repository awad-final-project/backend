import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Draft, DraftDocument } from './draft.schema';

export interface CreateDraftDto {
  to: string;
  subject: string;
  body: string;
  cc?: string;
  bcc?: string;
  replyTo?: string;
}

export interface UpdateDraftDto extends Partial<CreateDraftDto> {}

/**
 * Drafts Service
 * Handles email draft management
 */
@Injectable()
export class DraftsService {
  private readonly logger = new Logger(DraftsService.name);

  constructor(
    @InjectModel(Draft.name) private draftModel: Model<DraftDocument>,
  ) {}

  async createDraft(userId: string, draftDto: CreateDraftDto): Promise<Draft> {
    try {
      const draft = new this.draftModel({
        ...draftDto,
        userId,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const savedDraft = await draft.save();
      this.logger.log(`Draft created for user ${userId}: ${savedDraft._id}`);
      
      return savedDraft;
    } catch (error) {
      this.logger.error(`Failed to create draft for user ${userId}:`, error);
      throw new HttpException(
        {
          message: 'Failed to create draft',
          error: error.message || 'Unknown error occurred',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async updateDraft(
    userId: string,
    draftId: string,
    updateDto: UpdateDraftDto,
  ): Promise<Draft> {
    try {
      const draft = await this.draftModel.findOne({
        _id: draftId,
        userId,
      });

      if (!draft) {
        throw new HttpException(
          {
            message: 'Draft not found',
            error: 'The requested draft does not exist or you do not have permission to access it',
            draftId,
          },
          HttpStatus.NOT_FOUND,
        );
      }

      Object.assign(draft, updateDto, { updatedAt: new Date() });
      const updatedDraft = await draft.save();
      
      this.logger.log(`Draft updated for user ${userId}: ${draftId}`);
      return updatedDraft;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      
      this.logger.error(`Failed to update draft ${draftId}:`, error);
      throw new HttpException(
        {
          message: 'Failed to update draft',
          error: error.message || 'Unknown error occurred',
          draftId,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async getDrafts(userId: string): Promise<Draft[]> {
    try {
      const drafts = await this.draftModel
        .find({ userId })
        .sort({ updatedAt: -1 })
        .exec();

      return drafts;
    } catch (error) {
      this.logger.error(`Failed to fetch drafts for user ${userId}:`, error);
      throw new HttpException(
        {
          message: 'Failed to fetch drafts',
          error: error.message || 'Unknown error occurred',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async getDraft(userId: string, draftId: string): Promise<Draft> {
    try {
      const draft = await this.draftModel.findOne({
        _id: draftId,
        userId,
      });

      if (!draft) {
        throw new HttpException(
          {
            message: 'Draft not found',
            error: 'The requested draft does not exist or you do not have permission to access it',
            draftId,
          },
          HttpStatus.NOT_FOUND,
        );
      }

      return draft;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      
      this.logger.error(`Failed to fetch draft ${draftId}:`, error);
      throw new HttpException(
        {
          message: 'Failed to fetch draft',
          error: error.message || 'Unknown error occurred',
          draftId,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async deleteDraft(userId: string, draftId: string): Promise<void> {
    try {
      const result = await this.draftModel.deleteOne({
        _id: draftId,
        userId,
      });

      if (result.deletedCount === 0) {
        throw new HttpException(
          {
            message: 'Draft not found',
            error: 'The requested draft does not exist or you do not have permission to delete it',
            draftId,
          },
          HttpStatus.NOT_FOUND,
        );
      }

      this.logger.log(`Draft deleted for user ${userId}: ${draftId}`);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      
      this.logger.error(`Failed to delete draft ${draftId}:`, error);
      throw new HttpException(
        {
          message: 'Failed to delete draft',
          error: error.message || 'Unknown error occurred',
          draftId,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
