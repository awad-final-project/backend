import {
  PipeTransform,
  Injectable,
  ArgumentMetadata,
  BadRequestException,
} from '@nestjs/common';
import { isValidObjectId, Types } from 'mongoose';

/**
 * Pipe to validate and transform MongoDB ObjectId
 * Provides clear error messages for invalid IDs
 */
@Injectable()
export class ParseObjectIdPipe implements PipeTransform<string, Types.ObjectId> {
  transform(value: string, metadata: ArgumentMetadata): Types.ObjectId {
    const { data: paramName } = metadata;

    // Check if value exists
    if (!value) {
      throw new BadRequestException({
        message: `${paramName || 'ID'} is required`,
        field: paramName,
        value: value,
      });
    }

    // Check if it's a valid ObjectId format (24 hex characters)
    if (!isValidObjectId(value)) {
      throw new BadRequestException({
        message: `Invalid ${paramName || 'ID'} format. Expected a 24-character hexadecimal string`,
        field: paramName,
        value: value,
        expectedFormat: '24-character hexadecimal string (e.g., 507f1f77bcf86cd799439011)',
        actualLength: value.length,
        hint: 'MongoDB ObjectIDs must be exactly 24 characters long and contain only hexadecimal characters (0-9, a-f)',
      });
    }

    try {
      return new Types.ObjectId(value);
    } catch (error) {
      throw new BadRequestException({
        message: `Failed to parse ${paramName || 'ID'}`,
        field: paramName,
        value: value,
        error: error.message,
      });
    }
  }
}

/**
 * Decorator to validate ObjectId in route parameters
 * Usage: @Param('id', ParseObjectIdPipe) id: Types.ObjectId
 */
export function ValidateObjectId() {
  return ParseObjectIdPipe;
}
