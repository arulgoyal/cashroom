import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

/**
 * @Match('otherProperty')
 * ───────────────────────
 * A reusable class-validator constraint asserting that the decorated property
 * equals another property on the same object (e.g. confirmPassword === password).
 *
 * How a custom validator works under the hood:
 *  - `@ValidatorConstraint` registers a class whose `validate()` holds the rule.
 *  - `registerDecorator` attaches that constraint to a property as metadata
 *    (via reflect-metadata), exactly like the built-in @IsEmail/@MinLength do.
 *  - The global ValidationPipe later reads this metadata and runs `validate()`,
 *    so a mismatch is rejected with HTTP 400 before the controller ever runs.
 */
@ValidatorConstraint({ name: 'Match', async: false })
export class MatchConstraint implements ValidatorConstraintInterface {
  validate(value: unknown, args: ValidationArguments): boolean {
    const [relatedPropertyName] = args.constraints as [string];
    const relatedValue = (args.object as Record<string, unknown>)[
      relatedPropertyName
    ];
    return value === relatedValue;
  }

  defaultMessage(args: ValidationArguments): string {
    const [relatedPropertyName] = args.constraints as [string];
    return `${args.property} must match ${relatedPropertyName}`;
  }
}

export function Match(
  property: string,
  validationOptions?: ValidationOptions,
): PropertyDecorator {
  return (object: object, propertyName: string | symbol) => {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName as string,
      options: validationOptions,
      constraints: [property],
      validator: MatchConstraint,
    });
  };
}
