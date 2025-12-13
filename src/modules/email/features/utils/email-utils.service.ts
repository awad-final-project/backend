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
      // Check existing emails and allow re-seeding
      const existingEmails = await this.emailModel.countDocuments({
        accountId: userId,
      });
      
      if (existingEmails > 0) {
        this.logger.log(`User ${userId} has ${existingEmails} existing emails. Clearing for fresh seed...`);
        // Delete existing mock emails for this user to allow re-seeding
        await this.emailModel.deleteMany({ accountId: userId });
        this.logger.log(`Cleared ${existingEmails} existing emails.`);
      }

      const mockEmails = [];
      const folders = ['inbox', 'sent', 'archive', 'trash'];
      const totalEmails = faker.number.int({ min: 80, max: 120 }); // More varied count

      // Generate realistic contacts with diverse domains
      const domains = ['gmail.com', 'outlook.com', 'company.com', 'startup.io', 'tech.dev', 'corporate.net'];
      const contacts = Array.from({ length: 25 }, () => ({
        name: faker.person.fullName(),
        email: faker.internet.email().replace(/@.*$/, `@${faker.helpers.arrayElement(domains)}`),
        company: faker.company.name(),
        jobTitle: faker.person.jobTitle(),
      }));

      // Generate email threads (conversations)
      const threads = [];
      for (let i = 0; i < 15; i++) {
        const template = faker.helpers.arrayElement(this.emailTemplates);
        const subject = faker.helpers.arrayElement(template.subjects);
        const contact = faker.helpers.arrayElement(contacts);
        const threadLength = faker.number.int({ min: 1, max: 6 });
        
        threads.push({
          subject,
          contact,
          template,
          count: threadLength,
        });
      }

      // Generate threaded emails
      for (const thread of threads) {
        const baseDate = faker.date.recent({ days: 60 });
        const hasAttachment = faker.datatype.boolean(0.3); // 30% of threads have attachments
        
        for (let i = 0; i < thread.count; i++) {
          const isReply = i > 0;
          const isIncoming = i % 2 === 0;
          const sentDate = new Date(baseDate.getTime() + i * 3600000 * faker.number.int({ min: 1, max: 72 }));
          
          const body = thread.template.bodyGenerator();
          const subject = isReply ? `Re: ${thread.subject.replace(/^Re: /, '')}` : thread.subject;

          // Generate attachments for some emails
          const attachments = hasAttachment && faker.datatype.boolean(0.5) ? [
            {
              filename: faker.helpers.arrayElement([
                `${faker.word.noun()}_report.pdf`,
                `presentation_${faker.date.month()}.pptx`,
                `data_${faker.number.int({ min: 100, max: 999 })}.xlsx`,
                `image_${faker.word.adjective()}.png`,
                `document_final_v${faker.number.int({ min: 1, max: 5 })}.docx`,
              ]),
              size: faker.number.int({ min: 10000, max: 5000000 }),
              mimeType: faker.helpers.arrayElement([
                'application/pdf',
                'application/vnd.ms-excel',
                'image/png',
                'application/msword',
              ]),
            },
          ] : [];

          mockEmails.push({
            from: isIncoming ? thread.contact.email : userEmail,
            to: isIncoming ? userEmail : thread.contact.email,
            subject,
            body,
            preview: body.substring(0, 150).replace(/\n/g, ' ').trim(),
            isRead: faker.datatype.boolean(isIncoming ? 0.65 : 0.95), // Sent emails usually marked read
            isStarred: faker.datatype.boolean(0.18), // 18% starred
            hasAttachments: attachments.length > 0,
            attachments,
            folder: isIncoming ? 'inbox' : faker.helpers.arrayElement(['sent', 'sent', 'sent', 'archive']),
            labels: this.generateRandomLabels(),
            priority: faker.helpers.arrayElement(['high', 'normal', 'normal', 'normal', 'low']),
            sentAt: sentDate,
            accountId: userId,
          });
        }
      }

      // Generate additional standalone emails (newsletters, notifications, spam)
      const remainingCount = totalEmails - mockEmails.length;
      for (let i = 0; i < remainingCount; i++) {
        const template = faker.helpers.arrayElement(this.emailTemplates);
        const subject = faker.helpers.arrayElement(template.subjects);
        const contact = faker.helpers.arrayElement(contacts);
        const isIncoming = faker.datatype.boolean(0.7); // 70% incoming
        const body = template.bodyGenerator();
        const hasAttachment = faker.datatype.boolean(0.25);

        const attachments = hasAttachment ? Array.from(
          { length: faker.number.int({ min: 1, max: 3 }) },
          () => ({
            filename: faker.system.fileName(),
            size: faker.number.int({ min: 5000, max: 3000000 }),
            mimeType: faker.system.mimeType(),
          })
        ) : [];

        // Some emails go to trash
        const isTrash = faker.datatype.boolean(0.1);
        const folder = isTrash ? 'trash' : (
          isIncoming ? faker.helpers.arrayElement(['inbox', 'inbox', 'inbox', 'archive']) 
          : faker.helpers.arrayElement(['sent', 'sent', 'archive'])
        );

        mockEmails.push({
          from: isIncoming ? contact.email : userEmail,
          to: isIncoming ? userEmail : contact.email,
          subject,
          body,
          preview: body.substring(0, 150).replace(/\n/g, ' ').trim(),
          isRead: isTrash ? true : faker.datatype.boolean(0.6),
          isStarred: isTrash ? false : faker.datatype.boolean(0.12),
          hasAttachments: attachments.length > 0,
          attachments,
          folder,
          labels: this.generateRandomLabels(),
          priority: faker.helpers.arrayElement(['high', 'normal', 'normal', 'normal', 'normal', 'low']),
          sentAt: faker.date.recent({ days: 90 }),
          accountId: userId,
        });
      }

      // Add some important/urgent emails
      for (let i = 0; i < 5; i++) {
        const contact = faker.helpers.arrayElement(contacts);
        const urgentSubjects = [
          '🚨 URGENT: Production Server Down',
          '⚠️ Critical Bug in Latest Release',
          '🔥 HOT FIX Required Immediately',
          '❗ Security Vulnerability Detected',
          '⏰ Deadline Extended - Action Required',
        ];

        mockEmails.push({
          from: contact.email,
          to: userEmail,
          subject: urgentSubjects[i],
          body: `**URGENT ACTION REQUIRED**\n\n${faker.lorem.paragraphs(2)}\n\nPlease respond ASAP.\n\n${contact.name}\n${contact.jobTitle}`,
          preview: 'URGENT ACTION REQUIRED - ' + faker.lorem.sentence(),
          isRead: faker.datatype.boolean(0.4), // Urgent emails less likely to be read yet
          isStarred: true, // Star all urgent
          hasAttachments: false,
          attachments: [],
          folder: 'inbox',
          labels: ['urgent', 'work'],
          priority: 'high',
          sentAt: faker.date.recent({ days: 3 }),
          accountId: userId,
        });
      }

      // Sort by date (newest first)
      mockEmails.sort((a, b) => b.sentAt.getTime() - a.sentAt.getTime());

      // Save to database
      for (const email of mockEmails) {
        await this.emailModel.save(email);
      }

      const breakdown = {
        inbox: mockEmails.filter(e => e.folder === 'inbox').length,
        sent: mockEmails.filter(e => e.folder === 'sent').length,
        archived: mockEmails.filter(e => e.folder === 'archive').length,
        trash: mockEmails.filter(e => e.folder === 'trash').length,
        starred: mockEmails.filter(e => e.isStarred).length,
        unread: mockEmails.filter(e => !e.isRead).length,
        withAttachments: mockEmails.filter(e => e.hasAttachments).length,
        highPriority: mockEmails.filter(e => e.priority === 'high').length,
      };

      this.logger.log(`Seeded ${mockEmails.length} diverse mock emails for user ${userId}`, breakdown);

      return {
        message: `Successfully seeded ${mockEmails.length} realistic mock emails with threads, attachments, and labels`,
        count: mockEmails.length,
        breakdown,
      };
    } catch (error) {
      this.logger.error(`Error seeding mock emails: ${error.message}`);
      throw new HttpException(
        'Error seeding mock emails',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  private generateRandomLabels(): string[] {
    const allLabels = [
      'work', 'personal', 'urgent', 'important', 'finance', 
      'travel', 'receipts', 'invoices', 'newsletters', 'social',
      'promotions', 'updates', 'alerts', 'reports', 'meetings'
    ];
    
    const count = faker.number.int({ min: 0, max: 3 });
    if (count === 0) return [];
    
    return faker.helpers.arrayElements(allLabels, count);
  }
}
