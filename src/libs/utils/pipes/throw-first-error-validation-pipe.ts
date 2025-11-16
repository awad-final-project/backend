import { ValidationPipe } from '@nestjs/common';
import { BadRequestException } from '@nestjs/common';
import { ValidationError } from 'class-validator';

export function getConstraints(error: ValidationError): Record<string, string> {
  if (error.constraints) {
    return error.constraints;
  }

  let constraints = {};
  if (error.children) {
    for (const child of error.children) {
      constraints = {
        ...constraints,
        ...getConstraints(child),
      };
    }
  }
  return constraints;
}

export const ThrowFirstErrorValidationPipe = new ValidationPipe({
  exceptionFactory: (errors) => {
    const firstError = errors[0];
    const constraints = getConstraints(firstError);
    const firstConstraintKey = Object.keys(constraints)[0];
    throw new BadRequestException(constraints[firstConstraintKey]);
  },
});
