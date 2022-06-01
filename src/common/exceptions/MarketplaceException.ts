import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * MarketplaceException class.
 * Always use this exception if you want the message to be sent to the client.
 */
export class MarketplaceException extends HttpException {
  constructor(message = 'Bad Request') {
    super(
      {
        status: HttpStatus.BAD_REQUEST,
        error: 'Marketplace Exception',
        message: message,
      },
      HttpStatus.BAD_REQUEST,
    );
  }
}
