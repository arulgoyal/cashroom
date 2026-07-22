// These types ARE the contract with the BFF/backend. If the API shape changes,
// TypeScript flags every mismatched usage at compile time. Mirrors SafeUser +
// TokenPair + the AllExceptionsFilter error envelope.

export interface SafeUser {
  id: string; // bigint-as-string
  email: string;
  role: 'student' | 'admin';
  isEmailVerified: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

/** The JSON body both AllExceptionsFilters return on error. */
export interface ApiErrorBody {
  statusCode: number;
  message: string | string[]; // class-validator can return an array
  error?: string;
  requestId?: string;
  timestamp?: string;
  path?: string;
}

export interface SignupInput {
  email: string;
  password: string;
  confirmPassword: string;
}

export interface SigninInput {
  email: string;
  password: string;
}
