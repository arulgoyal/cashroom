import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { CreateUserData, UserService } from '../user/user.service';
import { User } from '../user/entities/user.entity';
import { UserRole } from '../user/enums/user-role.enum';
import { SignupDto } from './dto/signup.dto';
import { EmailAlreadyExistsException } from './exceptions/email-already-exists.exception';

/**
 * Unit tests for AuthService.signup.
 *
 * MOCKING: we replace the real UserService (and thus the DB) with a fake whose
 * methods are jest.fn(). A unit test must isolate the unit — no Postgres (slow,
 * stateful, would make this an integration test). We script the fake's return
 * values and then assert AuthService did the right thing. bcrypt is real (pure
 * CPU, deterministic enough to verify the hash), kept at low rounds for speed.
 */
describe('AuthService.signup', () => {
  let service: AuthService;
  let users: {
    findByEmail: jest.Mock<Promise<User | null>, [string]>;
    create: jest.Mock<Promise<User>, [CreateUserData]>;
  };

  const dto: SignupDto = {
    email: 'Student@Example.com',
    password: 'sup3rsecret',
    confirmPassword: 'sup3rsecret',
  };

  beforeEach(async () => {
    users = {
      findByEmail: jest.fn<Promise<User | null>, [string]>(),
      create: jest.fn<Promise<User>, [CreateUserData]>(),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UserService, useValue: users },
        // Low cost factor → fast tests. Production uses 12 via .env.
        { provide: ConfigService, useValue: { get: () => '4' } },
      ],
    }).compile();

    service = moduleRef.get(AuthService);
  });

  it('happy path: hashes the password, creates the user, returns no hash', async () => {
    users.findByEmail.mockResolvedValue(null);
    users.create.mockImplementation((data: CreateUserData) =>
      Promise.resolve(
        Object.assign(new User(), {
          id: '1',
          email: data.email,
          passwordHash: data.passwordHash,
          role: data.role ?? UserRole.STUDENT,
          isEmailVerified: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      ),
    );

    const result = await service.signup(dto);

    // looked up the duplicate by normalised (lowercased) email
    expect(users.findByEmail).toHaveBeenCalledWith('student@example.com');

    // created exactly once, with a bcrypt hash — NOT the plaintext
    expect(users.create).toHaveBeenCalledTimes(1);
    const created = users.create.mock.calls[0][0];
    expect(created.email).toBe('student@example.com');
    expect(created.passwordHash).not.toBe(dto.password);
    await expect(
      bcrypt.compare(dto.password, created.passwordHash),
    ).resolves.toBe(true);

    // returned object never carries the hash
    expect(result).not.toHaveProperty('passwordHash');
    expect(result.email).toBe('student@example.com');
    expect(result.role).toBe(UserRole.STUDENT);
  });

  it('duplicate email: throws 409 and never hashes or creates', async () => {
    users.findByEmail.mockResolvedValue(
      Object.assign(new User(), { id: '7', email: 'student@example.com' }),
    );
    const hashSpy = jest.spyOn(bcrypt, 'hash');

    await expect(service.signup(dto)).rejects.toBeInstanceOf(
      EmailAlreadyExistsException,
    );

    // ordering guarantee: the expensive work never ran
    expect(hashSpy).not.toHaveBeenCalled();
    expect(users.create).not.toHaveBeenCalled();

    hashSpy.mockRestore();
  });
});
