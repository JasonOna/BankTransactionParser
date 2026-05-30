import pino from 'pino';

let logger: pino.Logger;

/**
 * Initialize logger with specified level
 */
export function initLogger(level: string = 'info'): pino.Logger {
  logger = pino({
    level,
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'yyyy-mm-dd HH:MM:ss Z',
        ignore: 'pid,hostname',
      },
    },
  });
  return logger;
}

/**
 * Get the current logger instance
 */
export function getLogger(): pino.Logger {
  if (!logger) {
    logger = initLogger();
  }
  return logger;
}

export default getLogger();
