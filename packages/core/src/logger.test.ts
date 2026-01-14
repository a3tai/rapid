/**
 * Tests for logger.ts - Logging utilities
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { logger, setLogLevel, getLogLevel, type LogLevel } from './logger.js';

describe('logger', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let originalLogLevel: LogLevel;

  beforeEach(() => {
    originalLogLevel = getLogLevel();
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    setLogLevel(originalLogLevel);
  });

  describe('setLogLevel / getLogLevel', () => {
    it('should get and set log level', () => {
      setLogLevel('debug');
      expect(getLogLevel()).toBe('debug');

      setLogLevel('warn');
      expect(getLogLevel()).toBe('warn');

      setLogLevel('error');
      expect(getLogLevel()).toBe('error');

      setLogLevel('info');
      expect(getLogLevel()).toBe('info');
    });
  });

  describe('log level filtering', () => {
    it('should log all messages at debug level', () => {
      setLogLevel('debug');

      logger.debug('debug message');
      logger.info('info message');
      logger.warn('warn message');
      logger.error('error message');

      expect(consoleSpy).toHaveBeenCalledTimes(3); // debug, info, warn
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1); // error
    });

    it('should filter debug messages at info level', () => {
      setLogLevel('info');

      logger.debug('debug message');
      logger.info('info message');
      logger.warn('warn message');
      logger.error('error message');

      expect(consoleSpy).toHaveBeenCalledTimes(2); // info, warn only
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1); // error
    });

    it('should filter debug and info messages at warn level', () => {
      setLogLevel('warn');

      logger.debug('debug message');
      logger.info('info message');
      logger.warn('warn message');
      logger.error('error message');

      expect(consoleSpy).toHaveBeenCalledTimes(1); // warn only
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1); // error
    });

    it('should only log errors at error level', () => {
      setLogLevel('error');

      logger.debug('debug message');
      logger.info('info message');
      logger.warn('warn message');
      logger.error('error message');

      expect(consoleSpy).toHaveBeenCalledTimes(0);
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('success', () => {
    it('should log success messages at info level', () => {
      setLogLevel('info');
      logger.success('success message');
      expect(consoleSpy).toHaveBeenCalled();
    });

    it('should not log success messages at warn level', () => {
      setLogLevel('warn');
      logger.success('success message');
      expect(consoleSpy).not.toHaveBeenCalled();
    });
  });

  describe('additional arguments', () => {
    it('should pass additional arguments to console.log', () => {
      setLogLevel('info');
      const extra = { key: 'value' };
      logger.info('message with extra', extra);

      expect(consoleSpy).toHaveBeenCalled();
      const call = consoleSpy.mock.calls[0];
      expect(call).toContainEqual(extra);
    });
  });

  describe('styled output helpers', () => {
    it('should return styled strings for brand', () => {
      const result = logger.brand('RAPID');
      expect(typeof result).toBe('string');
      expect(result).toContain('RAPID');
    });

    it('should return styled strings for dim', () => {
      const result = logger.dim('dimmed text');
      expect(typeof result).toBe('string');
      expect(result).toContain('dimmed text');
    });

    it('should return styled strings for bold', () => {
      const result = logger.bold('bold text');
      expect(typeof result).toBe('string');
      expect(result).toContain('bold text');
    });
  });

  describe('header', () => {
    it('should log header with separator', () => {
      setLogLevel('info');
      logger.header('Test Header');

      // Should call console.log multiple times (blank, text, separator)
      expect(consoleSpy).toHaveBeenCalled();
    });
  });

  describe('blank', () => {
    it('should log empty line', () => {
      setLogLevel('info');
      logger.blank();
      expect(consoleSpy).toHaveBeenCalledWith();
    });
  });
});
