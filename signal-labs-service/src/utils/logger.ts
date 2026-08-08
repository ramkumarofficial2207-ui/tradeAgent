/**
 * logger.ts
 * Structured logger utility for Signal Labs Institutional Service
 */

export const logger = {
  info: (message: string, meta?: any) => {
    console.log(`[INFO] [${new Date().toISOString()}] ${message}`, meta ? JSON.stringify(meta) : '');
  },
  warn: (message: string, meta?: any) => {
    console.warn(`[WARN] [${new Date().toISOString()}] ${message}`, meta ? JSON.stringify(meta) : '');
  },
  error: (message: string, meta?: any) => {
    console.error(`[ERROR] [${new Date().toISOString()}] ${message}`, meta ? JSON.stringify(meta) : '');
  },
  success: (message: string, meta?: any) => {
    console.log(`[SUCCESS] [${new Date().toISOString()}] ✅ ${message}`, meta ? JSON.stringify(meta) : '');
  },
};
