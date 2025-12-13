export interface EmailFilterOptions {
  search?: string;
  from?: string;
  unread?: boolean;
  starred?: boolean;
  startDate?: Date;
  endDate?: Date;
  hasAttachments?: boolean;
  sort?: 'newest' | 'oldest';
}
