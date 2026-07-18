import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { AuthService, SafeUser, TokenPair } from './auth.service';
import { SignupDto } from './dto/signup.dto';
import { SigninDto } from './dto/signin.dto';
import { RefreshDto } from './dto/refresh.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * POST /auth/signup
   * Body validated by the global ValidationPipe against SignupDto. On success a
   * new user is created (201). Duplicate email → 409; invalid body → 400.
   * No JWT yet — returns the created user without its password hash.
   */
  @Post('signup')
  @HttpCode(HttpStatus.CREATED)
  signup(@Body() dto: SignupDto): Promise<SafeUser> {
    return this.authService.signup(dto);
  }

  /**
   * POST /auth/signin
   * Verify credentials → return { accessToken, refreshToken }. 200 (not 201 — no
   * resource created). Bad credentials → 401 (generic, no enumeration).
   */
  @Post('signin')
  @HttpCode(HttpStatus.OK)
  signin(@Body() dto: SigninDto): Promise<TokenPair> {
    return this.authService.signin(dto);
  }

  /**
   * POST /auth/refresh
   * Exchange a valid refresh token for a NEW pair (rotation). 200 on success;
   * invalid/expired/rotated refresh token → 401.
   */
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refresh(@Body() dto: RefreshDto): Promise<TokenPair> {
    return this.authService.refresh(dto);
  }
}
