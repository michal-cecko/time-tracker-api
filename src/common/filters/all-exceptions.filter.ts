import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { FastifyReply, FastifyRequest } from 'fastify';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<FastifyReply>();
    const request = ctx.getRequest<FastifyRequest>();

    const status =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    const message =
      exception instanceof HttpException
        ? exception.getResponse()
        : (exception as Error)?.message ?? 'Internal server error';

    if (status >= 500) this.logger.error(exception);

    response.status(status).send({
      statusCode: status,
      path: request.url,
      timestamp: new Date().toISOString(),
      error: typeof message === 'string' ? message : (message as any).message ?? message,
    });
  }
}
