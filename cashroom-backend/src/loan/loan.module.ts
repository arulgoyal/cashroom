import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LoanController } from './loan.controller';
import { LoanService } from './loan.service';
import { Loan } from './entities/loan.entity';

@Module({
  // Registers the Loan repository in this module and lets the global
  // `autoLoadEntities: true` discover the Loan entity for the connection.
  imports: [TypeOrmModule.forFeature([Loan])],
  controllers: [LoanController],
  providers: [LoanService],
  // Exported so later features (e.g. repayment schedule, disbursement) can reuse
  // loan persistence without re-registering the repository.
  exports: [LoanService],
})
export class LoanModule {}
