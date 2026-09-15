import winston from 'winston';
import chalk from 'chalk';
import { env } from '../config/env';

const customFormat = winston.format.printf(({ level, message, timestamp, ...meta }) => {
  let coloredLevel = level.toUpperCase();
  switch (level) {
    case 'info':
      coloredLevel = chalk.blue(`[INFO]`);
      break;
    case 'warn':
      coloredLevel = chalk.yellow(`[WARN]`);
      break;
    case 'error':
      coloredLevel = chalk.red(`[ERROR]`);
      break;
    case 'debug':
      coloredLevel = chalk.gray(`[DEBUG]`);
      break;
  }

  const metaStr = Object.keys(meta).length ? `\n${JSON.stringify(meta, null, 2)}` : '';
  const timeStr = chalk.gray(new Date(timestamp as string).toLocaleTimeString());

  return `${timeStr} ${coloredLevel} ${message} ${metaStr}`;
});

export const logger = winston.createLogger({
  level: env.LOG_LEVEL,
  format: winston.format.combine(
    winston.format.timestamp(),
    customFormat
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' })
  ]
});
