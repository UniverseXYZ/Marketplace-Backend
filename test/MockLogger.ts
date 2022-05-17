import { ConsoleLogger } from '@nestjs/common';

export class MockLogger extends ConsoleLogger {
  log(message: string): any {}
  error(message: string, trace: string): any {}
  warn(message: string): any {}
  debug(message: string): any {}
  verbose(message: string): any {}
}