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

  // Realistic email subjects and bodies
  private readonly emailTemplates = [
    {
      category: 'work',
      subjects: [
        'Re: Q4 Financial Report - Review Required',
        'Meeting Notes: Project Kickoff - Action Items',
        'URGENT: Server Maintenance Scheduled for Tonight',
        'Weekly Team Standup - Summary & Next Steps',
        'Fwd: Client Feedback on Recent Release',
        'Code Review Request: Feature/user-authentication',
        'Sprint Retrospective - Key Takeaways',
        'Re: Budget Approval for New Hiring',
        'Design System Updates - Breaking Changes',
        'Performance Review Schedule for Q1 2024',
      ],
      bodyGenerator: () => {
        const greeting = faker.helpers.arrayElement([
          'Hi team,',
          'Hello everyone,',
          'Hi there,',
          'Good morning,',
          'Good afternoon,',
        ]);
        const content = faker.helpers.arrayElement([
          `I wanted to follow up on our discussion from yesterday's meeting. ${faker.lorem.paragraph()}\n\nKey points:\n- ${faker.lorem.sentence()}\n- ${faker.lorem.sentence()}\n- ${faker.lorem.sentence()}\n\nLet me know your thoughts.`,
          `Please find attached the latest version of the document we discussed. ${faker.lorem.paragraph()}\n\nI've highlighted the main changes in yellow. Please review and provide feedback by EOD.`,
          `Quick update on the project status:\n\n✅ Completed: ${faker.lorem.sentence()}\n🔄 In Progress: ${faker.lorem.sentence()}\n⏳ Pending: ${faker.lorem.sentence()}\n\nWe're on track for the deadline.`,
          `${faker.lorem.paragraph()}\n\nAction items:\n1. ${faker.lorem.sentence()}\n2. ${faker.lorem.sentence()}\n3. ${faker.lorem.sentence()}\n\nPlease confirm receipt.`,
        ]);
        const signature = faker.helpers.arrayElement([
          'Best regards,',
          'Thanks,',
          'Regards,',
          'Best,',
        ]);
        return `${greeting}\n\n${content}\n\n${signature}\n${faker.person.fullName()}\n${faker.person.jobTitle()}`;
      },
    },
    {
      category: 'social',
      subjects: [
        'Re: Dinner plans this weekend?',
        'Check out these photos from the trip!',
        'Happy Birthday! 🎉',
        "You won't believe what happened today...",
        'Catch up coffee next week?',
        'Re: Book recommendation - you have to read this!',
        'Movie night at my place?',
        'Thanks for your help yesterday!',
        'Fwd: Funny meme I thought you\'d enjoy',
        'Weekend hiking trip - are you in?',
      ],
      bodyGenerator: () => {
        const greeting = faker.helpers.arrayElement([
          'Hey!',
          'Hi!',
          'Hello friend!',
          'Hey there!',
          'Hi buddy!',
        ]);
        const content = faker.lorem.paragraphs(2);
        const closing = faker.helpers.arrayElement([
          'Talk soon!',
          'Looking forward to hearing from you!',
          'Let me know!',
          'Catch you later!',
          'Take care!',
        ]);
        return `${greeting}\n\n${content}\n\n${closing}\n${faker.person.firstName()}`;
      },
    },
    {
      category: 'newsletter',
      subjects: [
        '📧 Weekly Tech Digest - Top Stories You Missed',
        '🚀 Product Update: New Features Released',
        '💡 5 Productivity Tips for Remote Workers',
        '📊 Monthly Analytics Report - December 2024',
        '🎓 Free Webinar: Advanced React Patterns',
        '🔥 Flash Sale: 50% Off Premium Plans',
        '📱 Mobile App Update Available',
        '🌟 Customer Success Story: How CompanyX Grew 10x',
        '⚡ Breaking: New Framework Released',
        '📚 Recommended Reading: Best of 2024',
      ],
      bodyGenerator: () => {
        return `${faker.lorem.paragraph()}\n\n## Top Stories\n\n1. **${faker.lorem.sentence()}**\n   ${faker.lorem.paragraph()}\n\n2. **${faker.lorem.sentence()}**\n   ${faker.lorem.paragraph()}\n\n3. **${faker.lorem.sentence()}**\n   ${faker.lorem.paragraph()}\n\n---\n\n${faker.lorem.sentence()}\n\n[Read More](https://example.com) | [Unsubscribe](https://example.com/unsubscribe)`;
      },
    },
    {
      category: 'notification',
      subjects: [
        '🔔 New comment on your post',
        '✅ Your order has been shipped',
        '🎯 Weekly goal achieved!',
        '⚠️ Password reset requested',
        '👥 3 new connection requests',
        '📸 You were tagged in a photo',
        '💬 New message from support',
        '🔒 Security alert: New login detected',
        '📦 Package delivered successfully',
        '⭐ You received a new review',
      ],
      bodyGenerator: () => {
        return `${faker.lorem.sentence()}\n\n${faker.lorem.paragraph()}\n\nIf this wasn't you, please contact support immediately.\n\n---\nThis is an automated message. Please do not reply.`;
      },
    },
  ];

  async seedMockEmails(userId: string, userEmail: string) {
    try {
      const existingEmails = await this.emailModel.countDocuments({
        accountId: userId,
      });
      
      if (existingEmails > 0) {
        this.logger.warn(`User ${userId} already has ${existingEmails} emails. Skipping seed.`);
        return { 
          message: `Mock emails already exist for this user (${existingEmails} emails found)`,
          count: existingEmails,
        };
      }

      const mockEmails = [];
      const folders = ['inbox', 'sent', 'archive'];
      const totalEmails = 50; // Increased from 30

      // Generate realistic contacts
      const contacts = Array.from({ length: 15 }, () => ({
        name: faker.person.fullName(),
        email: faker.internet.email(),
      }));

      // Generate email threads (conversations)
      const threads = [];
      for (let i = 0; i < 8; i++) {
        const template = faker.helpers.arrayElement(this.emailTemplates);
        const subject = faker.helpers.arrayElement(template.subjects);
        const contact = faker.helpers.arrayElement(contacts);
        const threadLength = faker.number.int({ min: 1, max: 4 });
        
        threads.push({
          subject,
          contact,
          template,
          count: threadLength,
        });
      }

      // Generate threaded emails
      for (const thread of threads) {
        const baseDate = faker.date.recent({ days: 30 });
        
        for (let i = 0; i < thread.count; i++) {
          const isReply = i > 0;
          const isIncoming = i % 2 === 0;
          const sentDate = new Date(baseDate.getTime() + i * 3600000 * faker.number.int({ min: 1, max: 48 })); // Add hours between replies
          
          const body = thread.template.bodyGenerator();
          const subject = isReply ? `Re: ${thread.subject.replace('Re: ', '')}` : thread.subject;

          mockEmails.push({
            from: isIncoming ? thread.contact.email : userEmail,
            to: isIncoming ? userEmail : thread.contact.email,
            subject,
            body,
            preview: body.substring(0, 150).replace(/\n/g, ' '),
            isRead: faker.datatype.boolean(0.7), // 70% read
            isStarred: faker.datatype.boolean(0.15), // 15% starred
            folder: isIncoming ? 'inbox' : faker.helpers.arrayElement(['sent', 'sent', 'archive']),
            sentAt: sentDate,
            accountId: userId,
          });
        }
      }

      // Generate additional standalone emails
      const remainingCount = totalEmails - mockEmails.length;
      for (let i = 0; i < remainingCount; i++) {
        const template = faker.helpers.arrayElement(this.emailTemplates);
        const subject = faker.helpers.arrayElement(template.subjects);
        const contact = faker.helpers.arrayElement(contacts);
        const isIncoming = faker.datatype.boolean(0.6); // 60% incoming
        const body = template.bodyGenerator();

        mockEmails.push({
          from: isIncoming ? contact.email : userEmail,
          to: isIncoming ? userEmail : contact.email,
          subject,
          body,
          preview: body.substring(0, 150).replace(/\n/g, ' '),
          isRead: faker.datatype.boolean(0.65),
          isStarred: faker.datatype.boolean(0.12),
          folder: isIncoming ? 'inbox' : faker.helpers.arrayElement(['sent', 'sent', 'archive']),
          sentAt: faker.date.recent({ days: 30 }),
          accountId: userId,
        });
      }

      // Sort by date (newest first)
      mockEmails.sort((a, b) => b.sentAt.getTime() - a.sentAt.getTime());

      // Save to database
      for (const email of mockEmails) {
        await this.emailModel.save(email);
      }

      this.logger.log(`Seeded ${mockEmails.length} realistic mock emails for user ${userId}`);

      return {
        message: `Successfully seeded ${mockEmails.length} realistic mock emails with conversations and threads`,
        count: mockEmails.length,
        breakdown: {
          inbox: mockEmails.filter(e => e.folder === 'inbox').length,
          sent: mockEmails.filter(e => e.folder === 'sent').length,
          archived: mockEmails.filter(e => e.folder === 'archive').length,
          starred: mockEmails.filter(e => e.isStarred).length,
          unread: mockEmails.filter(e => !e.isRead).length,
        },
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
