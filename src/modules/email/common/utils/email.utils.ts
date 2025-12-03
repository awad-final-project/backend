/**
 * Email utility functions
 * Single Responsibility Principle - each function has one clear purpose
 */

/**
 * Extract email address from string like "John Doe <john@example.com>"
 */
export function extractEmailAddress(emailString: string): string {
  if (!emailString) return '';

  const match = emailString.match(/<([^>]+)>/);
  if (match) {
    return match[1].trim();
  }

  return emailString.trim();
}

/**
 * Extract email body from Gmail API payload
 */
export function extractBodyFromPayload(payload: any): string {
  if (!payload) return '';

  let data = payload.body?.data;

  if (data) {
    data = data.replace(/-/g, '+').replace(/_/g, '/');
    while (data.length % 4) {
      data += '=';
    }
    return Buffer.from(data, 'base64').toString('utf-8');
  }

  if (payload.parts) {
    let part = payload.parts.find((p: any) => p.mimeType === 'text/html');

    if (!part) {
      part = payload.parts.find((p: any) => p.mimeType === 'text/plain');
    }

    if (part) {
      return extractBodyFromPayload(part);
    }

    for (const p of payload.parts) {
      if (p.mimeType?.startsWith('multipart/')) {
        const body = extractBodyFromPayload(p);
        if (body) return body;
      }
    }
  }

  return '';
}

/**
 * Map Gmail label to folder name
 */
export function mapGmailLabelToFolder(labelId: string): string {
  const mapping: Record<string, string> = {
    'INBOX': 'inbox',
    'SENT': 'sent',
    'DRAFT': 'drafts',
    'TRASH': 'trash',
    'STARRED': 'starred',
  };
  return mapping[labelId] || 'inbox';
}

/**
 * Map folder name to Gmail label
 */
export function mapFolderToGmailLabel(folder: string): string | undefined {
  const mapping: Record<string, string> = {
    'inbox': 'INBOX',
    'sent': 'SENT',
    'drafts': 'DRAFT',
    'trash': 'TRASH',
    'starred': 'STARRED',
  };
  return mapping[folder];
}

/**
 * Generate email preview from body
 */
export function generatePreview(body: string, maxLength: number = 150): string {
  if (!body) return '';
  
  // Strip HTML tags
  const text = body.replace(/<[^>]*>/g, '');
  
  // Decode HTML entities
  const decoded = text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"');
  
  // Trim and truncate
  const trimmed = decoded.trim();
  return trimmed.length > maxLength
    ? trimmed.substring(0, maxLength) + '...'
    : trimmed;
}

/**
 * Validate email address format
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Parse multiple email addresses from comma-separated string
 */
export function parseEmailList(emails: string): string[] {
  return emails
    .split(',')
    .map((email) => extractEmailAddress(email.trim()))
    .filter((email) => isValidEmail(email));
}

/**
 * Extract attachments from Gmail API payload
 */
export function extractAttachmentsFromPayload(payload: any): Array<{
  filename: string;
  mimeType: string;
  size: number;
  attachmentId: string;
}> {
  const attachments: Array<{
    filename: string;
    mimeType: string;
    size: number;
    attachmentId: string;
  }> = [];

  function extractParts(part: any) {
    if (part.filename && part.body?.attachmentId) {
      attachments.push({
        filename: part.filename,
        mimeType: part.mimeType || 'application/octet-stream',
        size: part.body.size || 0,
        attachmentId: part.body.attachmentId,
      });
    }

    if (part.parts) {
      part.parts.forEach((p: any) => extractParts(p));
    }
  }

  if (payload) {
    extractParts(payload);
  }

  return attachments;
}
