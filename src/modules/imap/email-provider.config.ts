export interface EmailProviderConfig {
  imap: {
    host: string;
    port: number;
    secure: boolean;
  };
  smtp: {
    host: string;
    port: number;
    secure: boolean;
  };
}

export const EMAIL_PROVIDERS: Record<string, EmailProviderConfig> = {
  gmail: {
    imap: {
      host: 'imap.gmail.com',
      port: 993,
      secure: true,
    },
    smtp: {
      host: 'smtp.gmail.com',
      port: 587,
      secure: false, // Uses STARTTLS
    },
  },
  outlook: {
    imap: {
      host: 'outlook.office365.com',
      port: 993,
      secure: true,
    },
    smtp: {
      host: 'smtp.office365.com',
      port: 587,
      secure: false, // Uses STARTTLS
    },
  },
  yahoo: {
    imap: {
      host: 'imap.mail.yahoo.com',
      port: 993,
      secure: true,
    },
    smtp: {
      host: 'smtp.mail.yahoo.com',
      port: 587,
      secure: false,
    },
  },
};

/**
 * Detect email provider from email address
 */
export function detectEmailProvider(email: string): string {
  const domain = email.split('@')[1]?.toLowerCase();
  
  if (!domain) {
    return 'gmail'; // Default
  }
  
  if (domain.includes('gmail.com') || domain.includes('googlemail.com')) {
    return 'gmail';
  }
  
  if (domain.includes('outlook.com') || domain.includes('hotmail.com') || 
      domain.includes('live.com') || domain.includes('office365.com')) {
    return 'outlook';
  }
  
  if (domain.includes('yahoo.com')) {
    return 'yahoo';
  }
  
  return 'gmail'; // Default fallback
}

/**
 * Get provider configuration
 */
export function getProviderConfig(provider: string): EmailProviderConfig {
  return EMAIL_PROVIDERS[provider] || EMAIL_PROVIDERS.gmail;
}
