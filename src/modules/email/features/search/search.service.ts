import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { Model } from 'mongoose';
import { EmailModel } from '@database/models';
import { Email, EmailDocument } from '@database/schemas/email.schema';
import Fuse from 'fuse.js';
import * as levenshtein from 'fast-levenshtein';

export interface SearchResult {
  email: EmailDocument;
  relevanceScore: number;
  matchType: 'exact' | 'fuzzy' | 'semantic' | 'partial';
}

export interface SearchMetadata {
  semanticSearchUsed: boolean;
  semanticSearchError: boolean;
  hasApiKey: boolean;
  totalResults: number;
}

export interface SearchOptions {
  query: string;
  userId: string;
  folder?: string;
  limit?: number;
  includeSemantic?: boolean;
}

@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);
  private apiKey: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly emailModel: EmailModel,
    @InjectModel(Email.name) private readonly emailMongooseModel: Model<EmailDocument>,
  ) {
    this.apiKey = this.configService.get<string>('GEMINI_API_KEY');
  }

  /**
   * Main search method that combines fuzzy, partial, and semantic search
   */
  async search(options: SearchOptions): Promise<SearchResult[]> {
    const { query, userId, folder, limit = 50, includeSemantic = true } = options;

    if (!query || query.trim().length === 0) {
      return [];
    }

    try {
      // Get all emails for the user
      const filter: any = { accountId: userId };
      if (folder && folder !== 'all') {
        if (folder === 'starred') {
          filter.isStarred = true;
          filter.folder = { $ne: 'trash' };
        } else {
          filter.folder = folder;
        }
      }

      const emails = await this.emailMongooseModel.find(filter).limit(1000).exec(); // Limit initial fetch

      if (emails.length === 0) {
        return [];
      }

      // Combine different search methods
      const results: SearchResult[] = [];

      // 1. Exact and partial matches (highest priority)
      const exactMatches = this.findExactMatches(emails, query);
      results.push(...exactMatches);

      // 2. Fuzzy matches (handles misspellings)
      const fuzzyMatches = this.findFuzzyMatches(emails, query);
      results.push(...fuzzyMatches);

      // 3. Semantic matches (if embeddings are available)
      let semanticSearchUsed = false;
      let semanticSearchError = false;
      if (includeSemantic && this.apiKey) {
        try {
          const semanticMatches = await this.findSemanticMatches(emails, query);
          results.push(...semanticMatches);
          semanticSearchUsed = semanticMatches.length > 0;
        } catch (error) {
          this.logger.warn('Semantic search failed, continuing with fuzzy/exact only:', error.message);
          semanticSearchError = true;
        }
      }

      // Remove duplicates and sort by relevance
      const uniqueResults = this.deduplicateAndRank(results, limit);

      // Attach metadata to results
      (uniqueResults as any).metadata = {
        semanticSearchUsed,
        semanticSearchError,
        hasApiKey: !!this.apiKey,
        totalResults: uniqueResults.length,
      };

      return uniqueResults;
    } catch (error) {
      this.logger.error('Error performing search:', error);
      throw new HttpException(
        {
          message: 'Search failed',
          error: error.message || 'Unknown error occurred',
        },
        error.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Find exact and partial matches
   */
  private findExactMatches(emails: EmailDocument[], query: string): SearchResult[] {
    const queryLower = query.toLowerCase();
    const results: SearchResult[] = [];

    for (const email of emails) {
      let score = 0;
      let matchType: SearchResult['matchType'] = 'partial';

      // Exact match in subject (highest score)
      if (email.subject.toLowerCase() === queryLower) {
        score = 100;
        matchType = 'exact';
      } else if (email.subject.toLowerCase().includes(queryLower)) {
        score = 80;
        matchType = 'partial';
      }

      // Exact match in from field
      if (email.from.toLowerCase() === queryLower) {
        score = Math.max(score, 90);
        matchType = 'exact';
      } else if (email.from.toLowerCase().includes(queryLower)) {
        score = Math.max(score, 70);
        matchType = 'partial';
      }

      // Partial match in body/preview
      if (email.body.toLowerCase().includes(queryLower)) {
        score = Math.max(score, 50);
        matchType = 'partial';
      } else if (email.preview.toLowerCase().includes(queryLower)) {
        score = Math.max(score, 40);
        matchType = 'partial';
      }

      if (score > 0) {
        results.push({ email, relevanceScore: score, matchType });
      }
    }

    return results;
  }

  /**
   * Find fuzzy matches using Fuse.js and Levenshtein distance
   */
  private findFuzzyMatches(emails: EmailDocument[], query: string): SearchResult[] {
    const results: SearchResult[] = [];
    const queryLower = query.toLowerCase();

    // Configure Fuse.js for fuzzy search
    const fuseOptions = {
      keys: [
        { name: 'subject', weight: 0.4 },
        { name: 'from', weight: 0.3 },
        { name: 'preview', weight: 0.2 },
        { name: 'body', weight: 0.1 },
      ],
      threshold: 0.4, // Lower threshold = more strict matching
      includeScore: true,
      minMatchCharLength: 2,
    };

    const fuse = new Fuse(emails, fuseOptions);
    const fuseResults = fuse.search(query);

    // Also use Levenshtein distance for contact matching
    for (const email of emails) {
      const fromLower = email.from.toLowerCase();
      const subjectLower = email.subject.toLowerCase();

      // Check if query is similar to contact name/email
      const fromDistance = levenshtein.get(queryLower, fromLower);
      const maxLength = Math.max(queryLower.length, fromLower.length);
      const similarity = 1 - fromDistance / maxLength;

      if (similarity > 0.6 && similarity < 1.0) {
        // Fuzzy match but not exact
        const existingIndex = results.findIndex((r) => r.email.id === email.id);
        if (existingIndex === -1) {
          results.push({
            email,
            relevanceScore: Math.round(similarity * 60), // Max 60 for fuzzy
            matchType: 'fuzzy',
          });
        }
      }

      // Check subject fuzzy match
      const subjectDistance = levenshtein.get(queryLower, subjectLower);
      const subjectMaxLength = Math.max(queryLower.length, subjectLower.length);
      const subjectSimilarity = 1 - subjectDistance / subjectMaxLength;

      if (subjectSimilarity > 0.5 && subjectSimilarity < 1.0) {
        const existingIndex = results.findIndex((r) => r.email.id === email.id);
        if (existingIndex === -1) {
          results.push({
            email,
            relevanceScore: Math.round(subjectSimilarity * 50),
            matchType: 'fuzzy',
          });
        } else {
          // Update if higher score
          results[existingIndex].relevanceScore = Math.max(
            results[existingIndex].relevanceScore,
            Math.round(subjectSimilarity * 50),
          );
        }
      }
    }

    // Add Fuse.js results
    for (const result of fuseResults) {
      const existingIndex = results.findIndex((r) => r.email.id === result.item.id);
      const score = Math.round((1 - result.score) * 55); // Convert Fuse score to relevance

      if (existingIndex === -1) {
        results.push({
          email: result.item,
          relevanceScore: score,
          matchType: 'fuzzy',
        });
      } else {
        results[existingIndex].relevanceScore = Math.max(
          results[existingIndex].relevanceScore,
          score,
        );
      }
    }

    return results;
  }

  /**
   * Find semantic matches using vector embeddings
   */
  private async findSemanticMatches(
    emails: EmailDocument[],
    query: string,
  ): Promise<SearchResult[]> {
    const results: SearchResult[] = [];

    try {
      // Generate embedding for query
      const queryEmbedding = await this.generateEmbedding(query);

      if (!queryEmbedding || queryEmbedding.length === 0) {
        return results;
      }

      // Calculate cosine similarity for emails with embeddings
      for (const email of emails) {
        let maxSimilarity = 0;

        // Check subject embedding
        if (email.subjectEmbedding && email.subjectEmbedding.length > 0) {
          const subjectSimilarity = this.cosineSimilarity(
            queryEmbedding,
            email.subjectEmbedding,
          );
          maxSimilarity = Math.max(maxSimilarity, subjectSimilarity);
        }

        // Check body embedding
        if (email.bodyEmbedding && email.bodyEmbedding.length > 0) {
          const bodySimilarity = this.cosineSimilarity(queryEmbedding, email.bodyEmbedding);
          maxSimilarity = Math.max(maxSimilarity, bodySimilarity * 0.8); // Body is less important
        }

        // Only include if similarity is above threshold
        if (maxSimilarity > 0.3) {
          results.push({
            email,
            relevanceScore: Math.round(maxSimilarity * 70), // Max 70 for semantic
            matchType: 'semantic',
          });
        }
      }
    } catch (error) {
      this.logger.warn('Semantic search failed, continuing without it:', error.message);
      // Don't throw, just return empty results
    }

    return results;
  }

  /**
   * Generate vector embedding using Gemini API
   */
  async generateEmbedding(text: string): Promise<number[]> {
    if (!this.apiKey) {
      return [];
    }

    try {
      // Use Gemini Embedding API - following official format
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': this.apiKey,
          },
          body: JSON.stringify({
            model: 'models/text-embedding-004',
            content: {
              parts: [{ text: text.substring(0, 1000) }],
            },
          }),
        },
      );

      if (!response.ok) {
        const errorData = await response.json();
        this.logger.error('Gemini embedding API error:', errorData);
        return [];
      }

      const data = await response.json();
      return data.embedding?.values || [];
    } catch (error) {
      this.logger.error('Error generating embedding:', error);
      return [];
    }
  }

  /**
   * Generate and store embeddings for an email
   */
  async generateEmailEmbeddings(emailId: string): Promise<void> {
    const email = await this.emailModel.findById(emailId);
    if (!email) {
      return;
    }

    try {
      // Generate subject embedding
      if (email.subject && (!email.subjectEmbedding || email.subjectEmbedding.length === 0)) {
        const subjectEmbedding = await this.generateEmbedding(email.subject);
        if (subjectEmbedding.length > 0) {
          email.subjectEmbedding = subjectEmbedding;
        }
      }

      // Generate body embedding (use preview or first 500 chars of body)
      const bodyText = email.preview || email.body.substring(0, 500);
      if (bodyText && (!email.bodyEmbedding || email.bodyEmbedding.length === 0)) {
        const bodyEmbedding = await this.generateEmbedding(bodyText);
        if (bodyEmbedding.length > 0) {
          email.bodyEmbedding = bodyEmbedding;
        }
      }

      await email.save();
    } catch (error) {
      this.logger.error(`Error generating embeddings for email ${emailId}:`, error);
    }
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  private cosineSimilarity(vecA: number[], vecB: number[]): number {
    if (vecA.length !== vecB.length || vecA.length === 0) {
      return 0;
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    if (denominator === 0) {
      return 0;
    }

    return dotProduct / denominator;
  }

  /**
   * Get suggestions by contact (for autocomplete)
   */
  async getContactSuggestions(userId: string, query: string, limit: number = 10): Promise<string[]> {
    if (!query || query.length < 2) {
      return [];
    }

    const filter: any = {
      accountId: userId,
      from: { $regex: query, $options: 'i' },
    };

    const contacts = await this.emailMongooseModel
      .distinct('from', filter)
      .exec();

    // Use fuzzy matching to rank suggestions
    const suggestions = (contacts as string[])
      .map((contact: string) => ({
        contact,
        score: this.calculateContactScore(contact, query),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((item) => item.contact);

    return suggestions;
  }

  /**
   * Get keyword suggestions (for autocomplete)
   */
  async getKeywordSuggestions(
    userId: string,
    query: string,
    limit: number = 10,
  ): Promise<string[]> {
    if (!query || query.length < 2) {
      return [];
    }

    const filter: any = {
      accountId: userId,
      $or: [
        { subject: { $regex: query, $options: 'i' } },
        { preview: { $regex: query, $options: 'i' } },
      ],
    };

    const emails = await this.emailMongooseModel.find(filter).limit(100).exec();

    // Extract keywords from subjects
    const keywordMap = new Map<string, number>();
    const queryLower = query.toLowerCase();

    for (const email of emails) {
      const words = email.subject.toLowerCase().split(/\s+/);
      for (const word of words) {
        if (word.length > 3 && word.includes(queryLower)) {
          keywordMap.set(word, (keywordMap.get(word) || 0) + 1);
        }
      }
    }

    // Sort by frequency and return top keywords
    return Array.from(keywordMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([keyword]) => keyword);
  }

  /**
   * Calculate contact match score for suggestions
   */
  private calculateContactScore(contact: string, query: string): number {
    const contactLower = contact.toLowerCase();
    const queryLower = query.toLowerCase();

    // Exact match
    if (contactLower === queryLower) {
      return 100;
    }

    // Starts with query
    if (contactLower.startsWith(queryLower)) {
      return 80;
    }

    // Contains query
    if (contactLower.includes(queryLower)) {
      return 60;
    }

    // Fuzzy match
    const contactDistance = levenshtein.get(queryLower, contactLower);
    const maxLength = Math.max(queryLower.length, contactLower.length);
    const similarity = 1 - contactDistance / maxLength;

    return Math.round(similarity * 40);
  }

  /**
   * Remove duplicates and rank results by relevance
   */
  private deduplicateAndRank(results: SearchResult[], limit: number): SearchResult[] {
    const emailMap = new Map<string, SearchResult>();

    // Keep the highest scoring result for each email
    for (const result of results) {
      const emailId = result.email.id.toString();
      const existing = emailMap.get(emailId);

      if (!existing || result.relevanceScore > existing.relevanceScore) {
        emailMap.set(emailId, result);
      }
    }

    // Sort by relevance score (descending) and return top results
    return Array.from(emailMap.values())
      .sort((a, b) => {
        // First by relevance score
        if (b.relevanceScore !== a.relevanceScore) {
          return b.relevanceScore - a.relevanceScore;
        }
        // Then by date (newer first)
        return new Date(b.email.sentAt).getTime() - new Date(a.email.sentAt).getTime();
      })
      .slice(0, limit);
  }
}

