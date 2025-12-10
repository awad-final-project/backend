import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private apiKey: string;

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this.configService.get<string>('GEMINI_API_KEY');
    if (!this.apiKey) {
      this.logger.warn('GEMINI_API_KEY not configured. AI features will be disabled.');
    }
  }

  async summarizeEmail(emailContent: {
    subject: string;
    from: string;
    body: string;
  }): Promise<string> {
    if (!this.apiKey) {
      throw new HttpException(
        'AI service is not configured. Please set GEMINI_API_KEY in environment variables.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    try {
      const prompt = `Hãy tóm tắt email sau một cách ngắn gọn và rõ ràng (khoảng 2-3 câu) bằng tiếng Việt:

Từ: ${emailContent.from}
Chủ đề: ${emailContent.subject}

Nội dung:
${emailContent.body.substring(0, 3000)}

Tóm tắt:`;

      // Use REST API directly instead of SDK
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-goog-api-key': this.apiKey,
          },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    text: prompt,
                  },
                ],
              },
            ],
          }),
        },
      );

      if (!response.ok) {
        const errorData = await response.json();
        this.logger.error('Gemini API error:', errorData);
        throw new Error(`API returned ${response.status}: ${JSON.stringify(errorData)}`);
      }

      const data = await response.json();
      const summary = data.candidates?.[0]?.content?.parts?.[0]?.text || 'Không thể tạo tóm tắt.';

      return summary.trim();
    } catch (error) {
      this.logger.error('Error summarizing email with Gemini AI:', error);
      // Return a default summary based on email content
      return `Email từ ${emailContent.from} với chủ đề "${emailContent.subject}". ${emailContent.body.substring(0, 150)}...`;
    }
  }

  async generateReplyDraft(emailContent: {
    subject: string;
    from: string;
    body: string;
  }): Promise<string> {
    if (!this.apiKey) {
      throw new HttpException(
        'AI service is not configured. Please set GEMINI_API_KEY in environment variables.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    try {
      const prompt = `Hãy tạo một bản nháp trả lời email sau một cách chuyên nghiệp và lịch sự:

Từ: ${emailContent.from}
Chủ đề: ${emailContent.subject}

Nội dung email gốc:
${emailContent.body.substring(0, 2000)}

Bản nháp trả lời:`;

      // Use REST API directly instead of SDK
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-goog-api-key': this.apiKey,
          },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    text: prompt,
                  },
                ],
              },
            ],
          }),
        },
      );

      if (!response.ok) {
        const errorData = await response.json();
        this.logger.error('Gemini API error:', errorData);
        throw new Error(`API returned ${response.status}: ${JSON.stringify(errorData)}`);
      }

      const data = await response.json();
      const draft = data.candidates?.[0]?.content?.parts?.[0]?.text || 'Không thể tạo bản nháp.';

      return draft.trim();
    } catch (error) {
      this.logger.error('Error generating reply draft with Gemini AI:', error);
      // Return a default polite reply template
      return `Kính gửi ${emailContent.from},\n\nCảm ơn bạn đã gửi email với chủ đề "${emailContent.subject}".\n\nTôi đã nhận được email của bạn và sẽ xem xét kỹ nội dung. Tôi sẽ phản hồi chi tiết trong thời gian sớm nhất.\n\nTrân trọng,`;
    }
  }
}
