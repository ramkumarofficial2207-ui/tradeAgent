/**
 * index.ts
 * Signal Labs Institutional Momentum Background Worker Entry Point
 * Runs automated EOD ingestion, HFT scrubbing, candidate pooling, and breakout scanning at 16:30 IST Mon-Fri.
 */

import cron from 'node-cron';
import { CONFIG } from './config/constants';
import { fetchNseBulkDealsEod } from './ingestion/nseBulkDeals';
import { fetchNseBhavcopyEod } from './ingestion/nseBhavcopy';
import { scrubHftNoiseAndStore } from './engine/hftScrubber';
import { buildInstitutionalCandidatePool } from './engine/candidatePool';
import { runInstitutionalTechnicalScan } from './scanner/institutionalScan';
import { logger } from './utils/logger';

export async function runSignalLabsPipeline(): Promise<{
  rawDealsCount: number;
  accumulationCount: number;
  discardedHftCount: number;
  candidateCount: number;
  alertsCount: number;
}> {
  logger.info('────────────────────────────────────────────────────────────');
  logger.info('🚀 Starting Signal Labs Institutional Momentum Pipeline');
  logger.info('────────────────────────────────────────────────────────────');

  const startTime = Date.now();

  // Step 1: Ingestion
  const rawDeals = await fetchNseBulkDealsEod();
  const bhavcopyMap = await fetchNseBhavcopyEod();

  // Step 2: HFT Noise Scrubbing
  const scrubResult = await scrubHftNoiseAndStore(rawDeals);

  // Step 3: Delivery Confirmation & Rolling Candidate Pool
  const candidatePool = await buildInstitutionalCandidatePool(
    scrubResult.accumulationSymbols,
    bhavcopyMap
  );

  // Step 4: Specialized Technical Setup Breakout Scanner
  const alerts = await runInstitutionalTechnicalScan(candidatePool);

  const durationMs = Date.now() - startTime;
  logger.info('────────────────────────────────────────────────────────────');
  logger.success(`Pipeline execution complete in ${(durationMs / 1000).toFixed(2)}s`);
  logger.info(`  • Raw Deals Processed : ${rawDeals.length}`);
  logger.info(`  • Accumulations Kept  : ${scrubResult.accumulationCount}`);
  logger.info(`  • Discarded HFT Noise : ${scrubResult.hftDiscardCount}`);
  logger.info(`  • Candidates Scanned  : ${candidatePool.length}`);
  logger.info(`  • Breakout Alerts Found: ${alerts.length}`);
  logger.info('────────────────────────────────────────────────────────────');

  return {
    rawDealsCount: rawDeals.length,
    accumulationCount: scrubResult.accumulationCount,
    discardedHftCount: scrubResult.hftDiscardCount,
    candidateCount: candidatePool.length,
    alertsCount: alerts.length,
  };
}

// ── Background Cron Scheduler ────────────────────────────────────────────────
if (require.main === module) {
  logger.info(`📅 Signal Labs Worker initialized. Schedule: ${CONFIG.CRON_SCHEDULE} (16:30 IST Mon-Fri)`);

  cron.schedule(
    CONFIG.CRON_SCHEDULE,
    async () => {
      logger.info('⏰ Cron triggered at 16:30 IST. Launching pipeline...');
      try {
        await runSignalLabsPipeline();
      } catch (err: any) {
        logger.error(`Cron pipeline error: ${err.message}`);
      }
    },
    {
      timezone: 'Asia/Kolkata',
    }
  );

  logger.info('⚡ Signal Labs Background Worker is running... (Press Ctrl+C to exit)');
}
