import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { EmailModel } from '@database/models';
import { faker } from '@faker-js/faker';

/**
 * Email Utilities Service
 * Development and testing utilities
 */
@Injectable()
export class EmailUtilsService {
  private readonly logger = new Logger(EmailUtilsService.name);

  constructor(private readonly emailModel: EmailModel) {}

  async seedMockEmails(userId: string, userEmail: string) {
    try {
      const existingEmails = await this.emailModel.countDocuments({
        accountId: userId,
      });
      
      if (existingEmails > 0) {
        return { message: 'Mock emails already exist for this user' };
      }

      const mockEmails = [];
      const folders = ['inbox', 'sent', 'drafts', 'archive'];

      for (let i = 0; i < 30; i++) {
        const isIncoming = Math.random() > 0.5;
        const folder = folders[Math.floor(Math.random() * folders.length)];
        const body = faker.lorem.paragraphs(3);

        mockEmails.push({
          from: isIncoming ? faker.internet.email() : userEmail,
          to: isIncoming ? userEmail : faker.internet.email(),
          subject: faker.lorem.sentence(),
          body,
          preview: body.substring(0, 100),
          isRead: Math.random() > 0.3,
          isStarred: Math.random() > 0.8,
          folder: isIncoming ? 'inbox' : folder,
          sentAt: faker.date.recent({ days: 30 }),
          accountId: userId,
        });
      }

      for (const email of mockEmails) {
        await this.emailModel.save(email);
      }

      this.logger.log(`Seeded ${mockEmails.length} mock emails for user ${userId}`);

      return {
        message: `Successfully seeded ${mockEmails.length} mock emails`,
      };
    } catch (error) {
      this.logger.error(`Error seeding mock emails: ${error.message}`);
      throw new HttpException(
        'Error seeding mock emails',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
