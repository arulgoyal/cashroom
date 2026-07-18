import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserController } from './user.controller';
import { UserService } from './user.service';
import { User } from './entities/user.entity';

@Module({
  // Registers the User repository in this module's scope and lets the global
  // `autoLoadEntities: true` discover the User entity for the connection.
  imports: [TypeOrmModule.forFeature([User])],
  controllers: [UserController],
  providers: [UserService],
  // Export UserService so AuthModule (and others) can reuse user persistence
  // without re-registering the repository or owning writes to the users table.
  exports: [UserService],
})
export class UserModule {}
