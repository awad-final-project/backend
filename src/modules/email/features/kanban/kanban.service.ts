import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { Types } from 'mongoose';
import { KanbanColumnModel, KanbanCardModel } from '@database/models';
import { EmailProviderFactory } from '@email/providers/email-provider.factory';
import { GmailProviderService } from '@email/providers/gmail/gmail-provider.service';
import { ImapProviderService } from '@email/providers/imap/imap-provider.service';
import { DatabaseProviderService } from '@email/providers/database/database-provider.service';
import { CreateColumnDto, UpdateColumnDto, MoveCardDto } from '@app/libs/dtos';

export interface KanbanBoard {
  providerType: 'gmail' | 'imap' | 'database';
  columns: Array<{
    id: string;
    title: string;
    description?: string;
    position: number;
    gmailLabel?: string;
    label?: string;
    color?: string;
    isDefault: boolean;
    cards: Array<{
      emailId: string;
      position: number;
      emailProvider?: string;
    }>;
  }>;
}

/**
 * Kanban Service
 * Manages Kanban board with Gmail & Local email support
 * Syncs card movements with Gmail labels when applicable
 */
@Injectable()
export class KanbanService {
  private readonly logger = new Logger(KanbanService.name);
  
  // Track initialization in progress to prevent race conditions
  private readonly initializingUsers = new Set<string>();

  private readonly DEFAULT_COLUMNS = [
    { id: 'inbox', title: 'Inbox', description: 'New emails', position: 0, color: '#3b82f6', gmailLabel: 'INBOX', label: '', isDefault: true },
    { id: 'todo', title: 'To Do', description: 'Tasks to do', position: 1, color: '#eab308', gmailLabel: 'TODO', label: 'todo', isDefault: false },
    { id: 'in-progress', title: 'In Progress', description: 'Working on', position: 2, color: '#f97316', gmailLabel: 'IN_PROGRESS', label: 'in-progress', isDefault: false },
    { id: 'done', title: 'Done', description: 'Completed', position: 3, color: '#22c55e', gmailLabel: 'DONE', label: 'done', isDefault: false },
    { id: 'snoozed', title: 'Snoozed', description: 'Deferred emails', position: 4, color: '#8b5cf6', gmailLabel: 'SNOOZED', label: 'snoozed', isDefault: false },
  ];

  constructor(
    private readonly columnModel: KanbanColumnModel,
    private readonly cardModel: KanbanCardModel,
    private readonly providerFactory: EmailProviderFactory,
  ) {}

  /**
   * Initialize Kanban board for user with default columns
   */
  async initializeBoard(userId: string): Promise<KanbanBoard> {
    try {
      // Check if user already has columns
      const existingColumns = await this.columnModel.findByAccountId(userId);
      
      if (existingColumns.length === 0) {
        // Create default columns
        for (const col of this.DEFAULT_COLUMNS) {
          await this.columnModel.save({
            accountId: userId as any,
            ...col,
          });
        }
        this.logger.log(`Initialized Kanban board for user ${userId}`);
      }

      return this.getBoard(userId);
    } catch (error) {
      this.logger.error(`Failed to initialize board: ${error.message}`);
      throw new HttpException(
        'Failed to initialize Kanban board',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Get full Kanban board with columns and cards
   * Auto-initialize if board doesn't exist (backward compatible for old users)
   */
  async getBoard(userId: string): Promise<KanbanBoard> {
    try {
      let columns = await this.columnModel.findByAccountId(userId);
      
      // Auto-initialize if no columns exist
      // This handles: 1) Old users created before Kanban feature
      //               2) New users accessing Kanban for first time
      if (columns.length === 0) {
        // Prevent race condition if multiple tabs call simultaneously
        if (this.initializingUsers.has(userId)) {
          this.logger.debug(`Board initialization already in progress for user ${userId}, waiting...`);
          // Wait a bit and retry
          await new Promise(resolve => setTimeout(resolve, 1000));
          columns = await this.columnModel.findByAccountId(userId);
          
          // If still empty after waiting, something went wrong
          if (columns.length === 0) {
            this.logger.warn(`Board still empty for user ${userId} after waiting, retrying initialization...`);
          }
        }
        
        // Double-check after potential wait
        if (columns.length === 0) {
          this.initializingUsers.add(userId);
          
          try {
            // Final check before creating (handle race condition)
            const recheck = await this.columnModel.findByAccountId(userId);
            if (recheck.length > 0) {
              this.logger.debug(`Columns appeared for user ${userId} during race condition check`);
              columns = recheck;
            } else {
              this.logger.log(`No columns found for user ${userId}, auto-initializing board...`);
              
              // Create default columns with error handling for duplicates
              for (const col of this.DEFAULT_COLUMNS) {
                try {
                  await this.columnModel.save({
                    accountId: new Types.ObjectId(userId),
                    ...col,
                  });
                } catch (saveError: any) {
                  // Ignore duplicate key errors (E11000) - means another request already created it
                  if (saveError.code === 11000 || saveError.message?.includes('E11000')) {
                    this.logger.debug(`Column ${col.id} already exists for user ${userId} (duplicate key), skipping...`);
                  } else {
                    // Re-throw other errors
                    throw saveError;
                  }
                }
              }
              
              this.logger.log(`Successfully initialized Kanban board for user ${userId}`);
              columns = await this.columnModel.findByAccountId(userId);
            }
          } finally {
            // Always remove from tracking set
            this.initializingUsers.delete(userId);
          }
        }
      }

      // Ensure we have columns (safety check)
      if (columns.length === 0) {
        this.logger.error(`No columns found for user ${userId} after initialization attempts`);
        throw new HttpException(
          'Failed to initialize Kanban board - no columns created',
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }

      const cards = await this.cardModel.findByAccountId(userId);

      // Determine provider type for user
      const provider = await this.providerFactory.getProvider(userId);
      let providerType: 'gmail' | 'imap' | 'database' = 'database';
      if (provider instanceof GmailProviderService) {
        providerType = 'gmail';
      } else if (provider instanceof ImapProviderService) {
        providerType = 'imap';
      } else if (provider instanceof DatabaseProviderService) {
        providerType = 'database';
      }

      // Group cards by column
      const cardsByColumn = cards.reduce((acc, card) => {
        if (!acc[card.columnId]) acc[card.columnId] = [];
        acc[card.columnId].push({
          emailId: card.emailId,
          position: card.position,
          emailProvider: card.emailProvider,
        });
        return acc;
      }, {} as Record<string, any[]>);

      const board = {
        providerType,
        columns: columns.map((col) => ({
          id: col.id,
          title: col.title,
          description: col.description,
          position: col.position,
          gmailLabel: col.gmailLabel,
          label: col.label,
          color: col.color,
          isDefault: col.isDefault,
          cards: cardsByColumn[col.id] || [],
        })),
      };

      this.logger.log(`Returning board for user ${userId} with ${columns.length} columns`);
      return board;
    } catch (error) {
      this.logger.error(`Failed to get board: ${error.message}`, error.stack);
      throw new HttpException(
        'Failed to fetch Kanban board',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Create a new column
   */
  async createColumn(userId: string, data: CreateColumnDto) {
    try {
      // Check if column ID already exists
      const existing = await this.columnModel.findByAccountAndColumnId(userId, data.id);
      if (existing) {
        this.logger.warn(`Column ${data.id} already exists for user ${userId}`);
        throw new HttpException('Column ID already exists', HttpStatus.CONFLICT);
      }

      const columnData = {
        accountId: new Types.ObjectId(userId),
        id: data.id,
        title: data.title,
        description: data.description,
        position: data.position ?? 999,
        gmailLabel: data.gmailLabel,
        label: data.label,
        color: data.color || '#3b82f6',
        isDefault: false,
      };
      
      const column = await this.columnModel.save(columnData);

      this.logger.log(`Created column ${data.id} for user ${userId}`);

      return {
        id: column.id,
        title: column.title,
        description: column.description,
        position: column.position,
        gmailLabel: column.gmailLabel,
        label: column.label,
        color: column.color,
        isDefault: column.isDefault,
      };
    } catch (error) {
      this.logger.error(`Failed to create column: ${error.message}`);
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        'Failed to create column',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Update column properties
   */
  async updateColumn(userId: string, columnId: string, data: UpdateColumnDto) {
    try {
      const column = await this.columnModel.updateColumn(userId, columnId, data);
      
      if (!column) {
        throw new HttpException('Column not found', HttpStatus.NOT_FOUND);
      }

      this.logger.log(`Updated column ${columnId} for user ${userId}`);

      return {
        id: column.id,
        title: column.title,
        description: column.description,
        position: column.position,
        gmailLabel: column.gmailLabel,
        label: column.label,
        color: column.color,
        isDefault: column.isDefault,
      };
    } catch (error) {
      this.logger.error(`Failed to update column: ${error.message}`);
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        'Failed to update column',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Delete a column (and move cards to inbox)
   */
  async deleteColumn(userId: string, columnId: string) {
    try {
      // Cannot delete default columns
      const column = await this.columnModel.findByAccountAndColumnId(userId, columnId);
      if (!column) {
        throw new HttpException('Column not found', HttpStatus.NOT_FOUND);
      }

      if (column.isDefault) {
        throw new HttpException('Cannot delete default column', HttpStatus.BAD_REQUEST);
      }

      // Move all cards to inbox column
      const cards = await this.cardModel.findByAccountAndColumn(userId, columnId);
      for (const card of cards) {
        await this.cardModel.moveCard(userId, card.emailId, 'inbox', 0);
      }

      // Delete column
      const deleted = await this.columnModel.deleteColumn(userId, columnId);
      
      if (!deleted) {
        throw new HttpException('Failed to delete column', HttpStatus.INTERNAL_SERVER_ERROR);
      }

      this.logger.log(`Deleted column ${columnId} for user ${userId}`);

      return { message: 'Column deleted successfully', movedCards: cards.length };
    } catch (error) {
      this.logger.error(`Failed to delete column: ${error.message}`);
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        'Failed to delete column',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Move card between columns with Gmail sync
   */
  async moveCard(userId: string, data: MoveCardDto) {
    try {
      // Check if card exists
      let card = await this.cardModel.findByAccountAndEmail(userId, data.emailId);
      
      // If card doesn't exist, create it
      if (!card) {
        const provider = await this.providerFactory.getProvider(userId);
        const providerType = provider instanceof GmailProviderService ? 'gmail' : 'database';
        
        card = await this.cardModel.save({
          accountId: new Types.ObjectId(userId),
          emailId: data.emailId,
          columnId: data.fromColumn,
          position: 0,
          emailProvider: providerType,
        });
      }

      // Get source and target columns
      const sourceColumn = await this.columnModel.findByAccountAndColumnId(userId, data.fromColumn);
      const targetColumn = await this.columnModel.findByAccountAndColumnId(userId, data.toColumn);

      if (!targetColumn) {
        throw new HttpException('Target column not found', HttpStatus.NOT_FOUND);
      }

      // Move card in database
      const position = data.position ?? 0;
      await this.cardModel.moveCard(userId, data.emailId, data.toColumn, position);

      // Sync with Gmail labels if applicable
      await this.syncCardMovementWithGmail(
        userId,
        data.emailId,
        sourceColumn?.gmailLabel,
        targetColumn.gmailLabel,
      );

      this.logger.log(`Moved card ${data.emailId} from ${data.fromColumn} to ${data.toColumn}`);

      return {
        message: 'Card moved successfully',
        emailId: data.emailId,
        fromColumn: data.fromColumn,
        toColumn: data.toColumn,
        synced: !!targetColumn.gmailLabel,
      };
    } catch (error) {
      this.logger.error(`Failed to move card: ${error.message}`);
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        'Failed to move card',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Sync card movement with email provider labels
   * - Gmail: Uses add/removeLabel methods with custom labels
   * - Database: Uses updateLabels to store labels in MongoDB
   * - IMAP: No label sync (IMAP doesn't support custom labels)
   */
  private async syncCardMovementWithGmail(
    userId: string,
    emailId: string,
    oldGmailLabel?: string,
    newGmailLabel?: string,
  ) {
    try {
      const provider = await this.providerFactory.getProvider(userId);
      
      // Map system Gmail labels to custom labels
      // INBOX, SENT, DRAFT, SPAM, TRASH, etc. are system labels - don't touch them
      // TODO, IN_PROGRESS, DONE, SNOOZED are custom labels we manage
      const labelMap: Record<string, string> = {
        'TODO': 'todo',
        'IN_PROGRESS': 'in-progress',
        'DONE': 'done',
        'SNOOZED': 'snoozed',
      };

      // Get the actual label names to use
      // If gmailLabel is in labelMap, use mapped value
      // Otherwise, use the gmailLabel directly (for custom columns)
      const oldLabel = oldGmailLabel 
        ? (labelMap[oldGmailLabel] || oldGmailLabel.toLowerCase()) 
        : undefined;
      const newLabel = newGmailLabel 
        ? (labelMap[newGmailLabel] || newGmailLabel.toLowerCase()) 
        : undefined;

      // Gmail Provider: Use add/removeLabel methods
      if (provider instanceof GmailProviderService) {
        const gmailProvider = provider as any;

        // Remove old label (only if it's a custom label, not system label like INBOX)
        if (oldLabel && gmailProvider.removeLabel) {
          await gmailProvider.removeLabel(userId, emailId, oldLabel);
          this.logger.debug(`[Gmail] Removed label: ${oldLabel}`);
        }

        // Add new label (only if it's a custom label)
        if (newLabel && gmailProvider.addLabel) {
          await gmailProvider.addLabel(userId, emailId, newLabel);
          this.logger.debug(`[Gmail] Added label: ${newLabel}`);
        }
        return;
      }

      // Database Provider: Use updateLabels to store in MongoDB
      if (provider instanceof DatabaseProviderService && provider.updateLabels) {
        // Get current email to read existing labels
        const email = await provider.getEmailById(userId, emailId);
        if (!email) {
          this.logger.warn(`Email ${emailId} not found for label update`);
          return;
        }

        let labels = email.labels || [];

        // Remove old label
        if (oldLabel) {
          labels = labels.filter(l => l !== oldLabel);
          this.logger.debug(`[Database] Removed label: ${oldLabel}`);
        }

        // Add new label
        if (newLabel && !labels.includes(newLabel)) {
          labels.push(newLabel);
          this.logger.debug(`[Database] Added label: ${newLabel}`);
        }

        // Update labels in database
        await provider.updateLabels(userId, emailId, labels);
        return;
      }

      // IMAP Provider: No label support, just log
      this.logger.debug(`[IMAP] Label sync not supported, card movement tracked in database only`);
    } catch (error) {
      // Don't fail the whole operation if label sync fails
      this.logger.warn(`Failed to sync labels: ${error.message}`);
    }
  }

  /**
   * Add email to Kanban board (in inbox column by default)
   */
  async addEmail(userId: string, emailId: string, columnId: string = 'inbox') {
    try {
      // Check if already exists
      const existing = await this.cardModel.findByAccountAndEmail(userId, emailId);
      if (existing) {
        return { message: 'Email already on board', emailId };
      }

      // Determine provider type
      const provider = await this.providerFactory.getProvider(userId);
      const providerType = provider instanceof GmailProviderService ? 'gmail' : 'database';

      // Add to board
      await this.cardModel.save({
        accountId: new Types.ObjectId(userId),
        emailId,
        columnId,
        position: 0,
        emailProvider: providerType,
      });

      this.logger.log(`Added email ${emailId} to board for user ${userId}`);

      return { message: 'Email added to board', emailId, columnId };
    } catch (error) {
      this.logger.error(`Failed to add email: ${error.message}`);
      throw new HttpException(
        'Failed to add email to board',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Remove email from Kanban board
   */
  async removeEmail(userId: string, emailId: string) {
    try {
      const deleted = await this.cardModel.deleteCard(userId, emailId);
      
      if (!deleted) {
        throw new HttpException('Email not found on board', HttpStatus.NOT_FOUND);
      }

      this.logger.log(`Removed email ${emailId} from board for user ${userId}`);

      return { message: 'Email removed from board', emailId };
    } catch (error) {
      this.logger.error(`Failed to remove email: ${error.message}`);
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        'Failed to remove email from board',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
