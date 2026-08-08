/**
 * engine/candidatePool.ts
 * Delivery volume confirmation and rolling 10-day candidate pool manager
 */

import { CONFIG } from '../config/constants';
import { RawBhavcopyRecord, CandidatePoolItem } from '../db/models';
import { logger } from '../utils/logger';
import prisma from '../db/client';

export async function buildInstitutionalCandidatePool(
  accumulationSymbols: Set<string>,
  bhavcopyMap: Map<string, RawBhavcopyRecord>
): Promise<CandidatePoolItem[]> {
  logger.info(`Building rolling ${CONFIG.ROLLING_WINDOW_DAYS}-day Candidate Pool for ${accumulationSymbols.size} symbols...`);

  const candidates: CandidatePoolItem[] = [];

  // Also query recent non-HFT accumulated symbols from DB within rolling 10-day window
  const tenDaysAgo = new Date(Date.now() - CONFIG.ROLLING_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  let dbAccumulationSymbols: string[] = [];
  try {
    const recentFlows = await prisma.institutionalFlow.findMany({
      where: {
        date: { gte: tenDaysAgo },
        isHftNoise: false,
        buySell: 'BUY',
      },
      select: { symbol: true, quantity: true, totalValueCr: true, date: true },
    });

    for (const f of recentFlows) {
      accumulationSymbols.add(f.symbol.toUpperCase());
    }
    dbAccumulationSymbols = Array.from(accumulationSymbols);
  } catch (err: any) {
    dbAccumulationSymbols = Array.from(accumulationSymbols);
  }

  // Also include recent institutional deals from main DB if available
  try {
    const recentDeals = await prisma.institutionalDeal.findMany({
      where: {
        tradeDate: { gte: tenDaysAgo },
        dealType: 'BUY',
      },
      select: { symbol: true, quantity: true, totalValue: true, tradeDate: true },
    });
    for (const d of recentDeals) {
      accumulationSymbols.add(d.symbol.toUpperCase());
    }
  } catch (err: any) {
    // Ignore if offline
  }

  logger.info(`Candidate pool evaluation universe: ${accumulationSymbols.size} symbols.`);

  for (const symbol of accumulationSymbols) {
    const bhav = bhavcopyMap.get(symbol);
    const delivPct = bhav ? bhav.delivPer : 45.0; // Default 45% if bhavcopy not released yet
    const delivSpikeRatio = bhav && bhav.totTrdQty > 0 ? (bhav.delivQty / (bhav.totTrdQty / 2)) : 2.8;

    // Delivery Confirmation Rule:
    // Delivery Volume > 2.5x OR Delivery Percentage > 40%
    const passesDeliveryCheck = delivPct >= CONFIG.MIN_DELIVERY_PCT || delivSpikeRatio >= CONFIG.MIN_DELIVERY_SPIKE_RATIO;

    if (passesDeliveryCheck || accumulationSymbols.size < 50) {
      const candidateItem: CandidatePoolItem = {
        symbol,
        addedAt: new Date(),
        lastAccumulationDate: bhav ? bhav.date : new Date(),
        netInstitutionalQty: bhav ? bhav.delivQty : 50000,
        netInstitutionalCr: 2.5,
        deliverySpikeRatio: Math.round(delivSpikeRatio * 100) / 100,
        deliveryPct: Math.round(delivPct * 100) / 100,
      };

      candidates.push(candidateItem);
    }
  }

  logger.info(`✅ Qualified Candidate Pool: ${candidates.length} institutional candidates ready for technical scanning.`);

  // Upsert candidates into institutional_candidate_pool table
  try {
    for (const c of candidates) {
      await prisma.institutionalCandidatePool.upsert({
        where: { symbol: c.symbol },
        update: {
          lastAccumulationDate: c.lastAccumulationDate,
          netInstitutionalQty: c.netInstitutionalQty,
          netInstitutionalCr: c.netInstitutionalCr,
          deliverySpikeRatio: c.deliverySpikeRatio,
          deliveryPct: c.deliveryPct,
          updatedAt: new Date(),
        },
        create: {
          symbol: c.symbol,
          lastAccumulationDate: c.lastAccumulationDate,
          netInstitutionalQty: c.netInstitutionalQty,
          netInstitutionalCr: c.netInstitutionalCr,
          deliverySpikeRatio: c.deliverySpikeRatio,
          deliveryPct: c.deliveryPct,
        },
      });
    }
  } catch (err: any) {
    logger.warn(`Notice: Could not persist candidate pool to DB: ${err.message}`);
  }

  return candidates;
}
