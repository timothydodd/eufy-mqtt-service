import fs from 'fs';
import path from 'path';
import { createLogger, format, transports, Logger as WinstonLogger } from 'winston';

export enum LogLevel {
  TRACE = 'trace',
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
  FATAL = 'fatal',
}

export interface LoggingServiceConfig {
  level: LogLevel;
  logToConsole: boolean;
  logToFile: boolean;
  logDir?: string;
  logFileName?: string;
  serviceContext?: string;
}

export class LoggingService {
  private logger: WinstonLogger;
  private serviceContext: string;

  constructor(config: LoggingServiceConfig) {
    this.serviceContext = config.serviceContext || 'unknown';

    // Create log directory if logging to file and it doesn't exist
    if (config.logToFile && config.logDir) {
      fs.mkdirSync(config.logDir, { recursive: true });
    }

    // Configure logger
    const loggerTransports = [];

    // Add console transport if enabled
    if (config.logToConsole) {
      loggerTransports.push(
        new transports.Console({
          format: format.combine(
            format.colorize(),
            format.timestamp(),
            format.printf((info: any) => {
              const { timestamp, level, message, service, ...meta } = info;
              return `${timestamp} [${service || this.serviceContext}] ${level}: ${message} ${
                Object.keys(meta).length ? JSON.stringify(meta) : ''
              }`;
            })
          ),
        })
      );
    }

    // Add file transport if enabled
    if (config.logToFile && config.logDir && config.logFileName) {
      loggerTransports.push(
        new transports.File({
          filename: path.join(config.logDir, config.logFileName),
          format: format.combine(format.timestamp(), format.json()),
        })
      );
    }

    // Create the logger
    this.logger = createLogger({
      level: this.mapLogLevel(config.level),
      defaultMeta: { service: this.serviceContext },
      transports: loggerTransports,
    });
  }

  // Map our log levels to Winston levels
  private mapLogLevel(level: LogLevel): string {
    switch (level) {
      case LogLevel.TRACE:
        return 'silly';
      case LogLevel.DEBUG:
        return 'debug';
      case LogLevel.INFO:
        return 'info';
      case LogLevel.WARN:
        return 'warn';
      case LogLevel.ERROR:
        return 'error';
      case LogLevel.FATAL:
        return 'error'; // Winston doesn't have 'fatal', use 'error' instead
      default:
        return 'info';
    }
  }

  /**
   * Log a trace message
   */
  public trace(message: string, meta?: any): void {
    this.logger.silly(message, meta);
  }

  /**
   * Log a debug message
   */
  public debug(message: string, meta?: any): void {
    this.logger.debug(message, meta);
  }

  /**
   * Log an info message
   */
  public info(message: string, meta?: any): void {
    this.logger.info(message, meta);
  }

  /**
   * Log a warning message
   */
  public warn(message: string, meta?: any): void {
    this.logger.warn(message, meta);
  }

  /**
   * Log an error message
   */
  public error(message: string, error?: any): void {
    if (error instanceof Error) {
      this.logger.error(message, {
        error: {
          name: error.name,
          message: error.message,
          stack: error.stack,
        },
      });
    } else {
      this.logger.error(message, { error });
    }
  }

  /**
   * Log a fatal error message
   */
  public fatal(message: string, error?: any): void {
    if (error instanceof Error) {
      this.logger.error(`FATAL: ${message}`, {
        error: {
          name: error.name,
          message: error.message,
          stack: error.stack,
        },
      });
    } else {
      this.logger.error(`FATAL: ${message}`, { error });
    }
  }

  /**
   * Create a child logger with a specific context
   */
  public createChildLogger(context: string): LoggingService {
    const childLogger = this.logger.child({
      service: `${this.serviceContext}:${context}`,
    });

    // Create a new logging service that wraps the child logger
    const childLoggingService = new LoggingService({
      level: LogLevel.INFO,
      logToConsole: false,
      logToFile: false,
      serviceContext: `${this.serviceContext}:${context}`,
    });

    // Replace the logger with our child logger
    (childLoggingService as any).logger = childLogger;

    return childLoggingService;
  }
}
