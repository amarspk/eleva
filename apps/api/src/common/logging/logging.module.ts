import { Global, Module } from '@nestjs/common';
import { ZayjarLogger, getGlobalLogger } from './logger.service';

@Global()
@Module({
  providers: [
    {
      provide: ZayjarLogger,
      useFactory: (): ZayjarLogger => getGlobalLogger(),
    },
  ],
  exports: [ZayjarLogger],
})
export class LoggingModule {}
