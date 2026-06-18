import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { createHash } from 'crypto';
import { AuthService } from './auth.service';
import { CreateUserData, UserService } from '../user/user.service';
import { User } from '../user/entities/user.entity';
import { UserRole } from '../user/enums/user-role.enum';
import { SignupDto } from './dto/signup.dto';
import { EmailAlreadyExistsException } from './exceptions/email-already-exists.exception';

/**
 * Unit tests for AuthService.
 *
 * MOCKING: the real UserService (and thus the DB) is replaced with jest.fn()s so
 * the unit is isolated — no Postgres (slow, stateful). JwtService is REAL
 * (registered with a test secret) so signing/verifying/rotation are genuinely
 * exercised. bcrypt is real but at low rounds for speed.
 */
const TEST_ENV: Record<string, string> = {
  BCRYPT_ROUNDS: '4',
  JWT_SECRET: 'test-access-secret',
  JWT_EXPIRES_IN: '15m',
  JWT_REFRESH_SECRET: 'test-refresh-secret',
  JWT_REFRESH_EXPIRES_IN: '7d',
};

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

interface UsersMock {
  findByEmail: jest.Mock<Promise<User | null>, [string]>;
  create: jest.Mock<Promise<User>, [CreateUserData]>;
  findByEmailWithPassword: jest.Mock<Promise<User | null>, [string]>;
  findById: jest.Mock<Promise<User | null>, [string]>;
  findByIdWithRefreshHash: jest.Mock<Promise<User | null>, [string]>;
  updateRefreshTokenHash: jest.Mock<Promise<void>, [string, string | null]>;
}

describe('AuthService', () => {
  let service: AuthService;
  let jwt: JwtService;
  let users: UsersMock;

  const makeUser = (overrides: Partial<User> = {}): User =>
    Object.assign(new User(), {
      id: '1',
      email: 'student@example.com',
      role: UserRole.STUDENT,
      isEmailVerified: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    });

  beforeEach(async () => {
    users = {
      findByEmail: jest.fn<Promise<User | null>, [string]>(),
      create: jest.fn<Promise<User>, [CreateUserData]>(),
      findByEmailWithPassword: jest.fn<Promise<User | null>, [string]>(),
      findById: jest.fn<Promise<User | null>, [string]>(),
      findByIdWithRefreshHash: jest.fn<Promise<User | null>, [string]>(),
      updateRefreshTokenHash: jest
        .fn<Promise<void>, [string, string | null]>()
        .mockResolvedValue(undefined),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [
        JwtModule.register({
          secret: TEST_ENV.JWT_SECRET,
          signOptions: { expiresIn: '15m' },
        }),
      ],
      providers: [
        AuthService,
        { provide: UserService, useValue: users },
        {
          provide: ConfigService,
          useValue: { get: (k: string) => TEST_ENV[k] },
        },
      ],
    }).compile();

    service = moduleRef.get(AuthService);
    jwt = moduleRef.get(JwtService);
  });

  describe('signup', () => {
    const dto: SignupDto = {
      email: 'Student@Example.com',
      password: 'sup3rsecret',
      confirmPassword: 'sup3rsecret',
    };

    it('happy path: hashes the password, creates the user, returns no hash', async () => {
      users.findByEmail.mockResolvedValue(null);
      users.create.mockImplementation((data: CreateUserData) =>
        Promise.resolve(
          makeUser({ email: data.email, passwordHash: data.passwordHash }),
        ),
      );

      const result = await service.signup(dto);

      expect(users.findByEmail).toHaveBeenCalledWith('student@example.com');
      expect(users.create).toHaveBeenCalledTimes(1);
      const created = users.create.mock.calls[0][0];
      expect(created.passwordHash).not.toBe(dto.password);
      await expect(
        bcrypt.compare(dto.password, created.passwordHash),
      ).resolves.toBe(true);
      expect(result).not.toHaveProperty('passwordHash');
    });

    it('duplicate email: throws 409 and never hashes or creates', async () => {
      users.findByEmail.mockResolvedValue(makeUser({ id: '7' }));
      const hashSpy = jest.spyOn(bcrypt, 'hash');

      await expect(service.signup(dto)).rejects.toBeInstanceOf(
        EmailAlreadyExistsException,
      );
      expect(hashSpy).not.toHaveBeenCalled();
      expect(users.create).not.toHaveBeenCalled();
      hashSpy.mockRestore();
    });
  });

  describe('signin', () => {
    const dto = { email: 'Student@Example.com', password: 'sup3rsecret' };

    it('happy path: returns a token pair, stores the refresh hash, encodes claims', async () => {
      const passwordHash = await bcrypt.hash(dto.password, 4);
      users.findByEmailWithPassword.mockResolvedValue(
        makeUser({ passwordHash }),
      );

      const { accessToken, refreshToken } = await service.signin(dto);

      // access token carries { sub, email, role }
      const claims = jwt.verify<{ sub: string; email: string; role: string }>(
        accessToken,
        { secret: TEST_ENV.JWT_SECRET },
      );
      expect(claims.sub).toBe('1');
      expect(claims.email).toBe('student@example.com');
      expect(claims.role).toBe(UserRole.STUDENT);

      // the HASH of the refresh token was stored — never the raw token
      expect(users.updateRefreshTokenHash).toHaveBeenCalledWith(
        '1',
        sha256(refreshToken),
      );
    });

    it('wrong password: 401, no tokens, no refresh hash written', async () => {
      const passwordHash = await bcrypt.hash('a-different-password', 4);
      users.findByEmailWithPassword.mockResolvedValue(
        makeUser({ passwordHash }),
      );

      await expect(service.signin(dto)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(users.updateRefreshTokenHash).not.toHaveBeenCalled();
    });

    it('unknown email: 401, and still runs a compare (timing/enumeration defence)', async () => {
      users.findByEmailWithPassword.mockResolvedValue(null);
      const compareSpy = jest.spyOn(bcrypt, 'compare');

      await expect(service.signin(dto)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(compareSpy).toHaveBeenCalledTimes(1); // dummy compare ran
      compareSpy.mockRestore();
    });
  });

  describe('refresh', () => {
    const signRefresh = (sub: string) =>
      jwt.sign(
        { sub, jti: 'fixed-jti' },
        { secret: TEST_ENV.JWT_REFRESH_SECRET, expiresIn: '7d' },
      );

    it('valid + hash matches: returns a new pair and rotates the stored hash', async () => {
      const refreshToken = signRefresh('1');
      users.findByIdWithRefreshHash.mockResolvedValue(
        makeUser({ refreshTokenHash: sha256(refreshToken) }),
      );

      const result = await service.refresh({ refreshToken });

      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
      // rotation: a NEW hash (different jti) is stored
      const storedHash = users.updateRefreshTokenHash.mock.calls[0][1];
      expect(storedHash).toBe(sha256(result.refreshToken));
      expect(storedHash).not.toBe(sha256(refreshToken));
    });

    it('hash mismatch (reused/revoked token): 401, no rotation', async () => {
      const refreshToken = signRefresh('1');
      users.findByIdWithRefreshHash.mockResolvedValue(
        makeUser({ refreshTokenHash: sha256('some-other-token') }),
      );

      await expect(service.refresh({ refreshToken })).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(users.updateRefreshTokenHash).not.toHaveBeenCalled();
    });

    it('invalid signature: 401', async () => {
      const forged = jwt.sign(
        { sub: '1', jti: 'x' },
        { secret: 'wrong-secret', expiresIn: '7d' },
      );

      await expect(
        service.refresh({ refreshToken: forged }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(users.findByIdWithRefreshHash).not.toHaveBeenCalled();
    });

    it('expired token: 401', async () => {
      const expired = jwt.sign(
        { sub: '1', jti: 'x' },
        { secret: TEST_ENV.JWT_REFRESH_SECRET, expiresIn: '-1s' },
      );

      await expect(
        service.refresh({ refreshToken: expired }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });
});
