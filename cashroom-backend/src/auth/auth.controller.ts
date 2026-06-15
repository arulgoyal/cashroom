import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { AuthService, SafeUser } from './auth.service';
import { SignupDto } from './dto/signup.dto';

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
}
