/**
 * engine/hftScrubber.ts
 * Scrubs out high-frequency trading (HFT) intra-day arbitrage noise from raw bulk deal records
 */

import { RawBulkDealRecord, ProcessedInstitutionalFlow } from '../db/models';
import { logger } from '../utils/logger';
import prisma from '../db/client';

export interface HftScrubResult {
  scrubbedFlows: ProcessedInstitutionalFlow[];
  accumulationSymbols: Set<string>;
  hftDiscardCount: number;
  accumulationCount: number;
}

/**
 * Net position calculator & HFT filter logic.
 *
 * Rule:
 * Net Quantity = Total Buy Qty - Total Sell Qty
 * - IF Net Quantity == 0 OR Buy Qty == Sell Qty within same session -> FLAG AS HFT NOISE (isHftNoise = true) & DISCARD
 * - IF Net Quantity > 0 -> KEEP AS INSTITUTIONAL ACCUMULATION
 */
export async function scrubHftNoiseAndStore(
  deals: RawBulkDealRecord[]
): Promise<HftScrubResult> {
  logger.info(`Starting HFT noise scrubbing for ${deals.length} raw deal records...`);

  // Group deals by symbol and client for intraday position calculation
  const sessionMap = new Map<
    string,
    { buyQty: number; sellQty: number; totalBuyVal: number; totalSellVal: number; deals: RawBulkDealRecord[] }
  >();

  for (const deal of deals) {
    const key = `${deal.symbol}::${deal.clientName}::${deal.tradeDate.toISOString().split('T')[0]}`;
    if (!sessionMap.has(key)) {
      sessionMap.set(key, { buyQty: 0, sellQty: 0, totalBuyVal: 0, totalSellVal: 0, deals: [] });
    }
    const entry = sessionMap.get(key)!;
    entry.deals.push(deal);
    if (deal.buySell === 'BUY') {
      entry.buyQty += deal.quantity;
      entry.totalBuyVal += deal.totalValueCr;
    } else {
      entry.sellQty += deal.quantity;
      entry.totalSellVal += deal.totalValueCr;
    }
  }

  const scrubbedFlows: ProcessedInstitutionalFlow[] = [];
  const accumulationSymbols = new Set<string>();
  let hftDiscardCount = 0;
  let accumulationCount = 0;

  for (const [, session] of sessionMap) {
    const netQty = session.buyQty - session.sellQty;
    const isHft = netQty === 0 || (session.buyQty > 0 && session.buyQty === session.sellQty);

    for (const d of session.deals) {
      const flow: ProcessedInstitutionalFlow = {
        symbol: d.symbol,
        date: d.tradeDate,
        clientName: d.clientName,
        buySell: d.buySell,
        quantity: d.quantity,
        avgPrice: d.price,
        totalValueCr: d.totalValueCr,
        isHftNoise: isHft,
      };

      scrubbedFlows.push(flow);

      if (isHft) {
        hftDiscardCount++;
      } else if (netQty > 0) {
        accumulationCount++;
        accumulationSymbols.add(d.symbol);
      }
    }
  }

  logger.info(
    `HFT Scrub Complete. Accumulations: ${accumulationCount}, Discarded HFT Noise: ${hftDiscardCount}, Unique Symbols: ${accumulationSymbols.size}`
  );

  // Persist processed flows to database asynchronously (skipping duplicates)
  try {
    const recordsToInsert = scrubbedFlows.slice(0, 500); // batch limit
    await prisma.institutionalFlow.createMany({
      data: recordsToInsert.map((f) => ({
        symbol: f.symbol,
        date: f.date,
        clientName: f.clientName,
        buySell: f.buySell,
        quantity: f.quantity,
        avgPrice: f.avgPrice,
        totalValueCr: f.totalValueCr,
        isHftNoise: f.isHftNoise,
      })),
      skipDuplicates: true,
    });
  } catch (err: any) {
    logger.warn(`Notice: Could not insert flows batch into DB: ${err.message}`);
  }

  return {
    scrubbedFlows,
    accumulationSymbols,
    hftDiscardCount,
    accumulationCount,
  };
}
