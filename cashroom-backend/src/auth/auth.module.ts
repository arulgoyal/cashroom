import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { UserModule } from '../user/user.module';
import { EMAIL_QUEUE } from '../queue/queue.constants';

@Module({
  // UserModule exports UserService; importing it lets AuthService reuse user
  // persistence (findByEmail / create) instead of touching the repository.
  // registerQueue('email') makes the producer-side Queue injectable here via
  // @InjectQueue(EMAIL_QUEUE) (the root connection comes from AppModule).
  imports: [UserModule, BullModule.registerQueue({ name: EMAIL_QUEUE })],
  controllers: [AuthController],
  providers: [AuthService],
})
export class AuthModule {}
