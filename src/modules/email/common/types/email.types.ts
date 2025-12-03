/**
 * Email-related types and enums
 */

export type EmailFolder = 'inbox' | 'sent' | 'drafts' | 'trash' | 'archive' | 'starred';

export enum EmailFolderEnum {
  INBOX = 'inbox',
  SENT = 'sent',
  DRAFTS = 'drafts',
  TRASH = 'trash',
  ARCHIVE = 'archive',
  STARRED = 'starred',
}

export interface PaginationParams {
  page: number;
  limit: number;
}

export interface AttachmentUpload {
  content: Buffer;
  filename: string;
  mimeType: string;
}
