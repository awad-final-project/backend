/**
 * Core email message interface representing an email entity
 * Following Interface Segregation Principle - base interface with minimal properties
 */
export interface IEmailMessage {
  id: string;
  from: string;
  to: string;
  subject: string;
  sentAt: Date;
}

/**
 * Extended interface with preview text for list views
 */
export interface IEmailPreview extends IEmailMessage {
  preview: string;
  isRead: boolean;
  isStarred: boolean;
  folder: string;
  hasAttachments?: boolean;
}

/**
 * Full email details including body content
 */
export interface IEmailDetail extends IEmailPreview {
  body: string;
  cc?: string;
  bcc?: string;
  readAt?: Date;
  attachments?: IAttachmentRef[];
}

/**
 * Attachment reference in email
 */
export interface IAttachmentRef {
  id: string;
  attachmentId: string;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  s3Key?: string;
}

/**
 * Paginated email list response
 */
export interface IEmailListResponse {
  emails: IEmailPreview[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  nextPageToken?: string; // Gmail API pageToken for next page
  hasMore: boolean; // Whether there are more pages available
}

/**
 * Mailbox/folder information
 */
export interface IMailbox {
  id: string;
  name: string;
  count: number;
  icon: string;
}
