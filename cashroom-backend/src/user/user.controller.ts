import { Controller, Get, NotFoundException, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { JwtPayloadWithTimestamps } from '../auth/interfaces/jwt-payload.interface';
import { UserService } from './user.service';
import { User } from './entities/user.entity';

@Controller('user')
export class UserController {
  constructor(private readonly users: UserService) {}

  /**
   * GET /user/me  — protected by JwtAuthGuard.
   * The guard verifies the access token and attaches the payload; we resolve the
   * `sub` to the current DB row (reflecting up-to-date role/verified state) and
   * return it. password_hash / refresh_token_hash are `select:false`, so they are
   * never loaded or serialized.
   *
   * No token → 401 (missing); bad token → 401 (invalid); past exp → 401 (expired).
   */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(@CurrentUser() payload: JwtPayloadWithTimestamps): Promise<User> {
    const user = await this.users.findById(payload.sub);
    if (!user) {
      // Token was valid but the user is gone (deleted since issue). 
      throw new NotFoundException('User not found');
    }
    return user;
  }
}
