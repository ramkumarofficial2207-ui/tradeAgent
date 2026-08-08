/**
 * ingestion/nseBulkDeals.ts
 * Scrapes/fetches EOD Large Deals API or reads recent InstitutionalDeal records from DB
 */

import axios from 'axios';
import { parse as parseCsv } from 'csv-parse/sync';
import { CONFIG } from '../config/constants';
import { RawBulkDealRecord } from '../db/models';
import { withExponentialBackoff } from '../utils/retry';
import { logger } from '../utils/logger';
import prisma from '../db/client';

export async function fetchNseBulkDealsEod(targetDate?: Date): Promise<RawBulkDealRecord[]> {
  return withExponentialBackoff(
    async () => {
      logger.info('Fetching EOD Large Deals from NSE / DB repository...');

      // 1. Try querying DB for latest InstitutionalDeal records first
      const dateFilter = targetDate
        ? { gte: new Date(targetDate.getTime() - 24 * 60 * 60 * 1000 * 2) }
        : { gte: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000) };

      const dbDeals = await prisma.institutionalDeal.findMany({
        where: { tradeDate: dateFilter },
        orderBy: { tradeDate: 'desc' },
      });

      if (dbDeals.length > 0) {
        logger.info(`Retrieved ${dbDeals.length} raw deal records from database.`);
        return dbDeals.map((d) => ({
          symbol: d.symbol.toUpperCase(),
          clientName: d.clientName,
          buySell: d.dealType.toUpperCase() === 'BUY' ? 'BUY' : 'SELL',
          quantity: d.quantity,
          price: d.price,
          totalValueCr: d.totalValue,
          tradeDate: d.tradeDate,
          remarks: d.remarks || '',
        }));
      }

      // 2. Fallback to live NSE Daily Bulk CSV archive
      logger.info(`Fetching live CSV archive from ${CONFIG.NSE_DAILY_BULK_CSV}...`);
      const response = await axios.get(CONFIG.NSE_DAILY_BULK_CSV, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'text/csv,*/*',
          'Referer': 'https://www.nseindia.com/',
        },
        timeout: 10000,
      });

      if (response.status !== 200 || !response.data) {
        throw new Error(`Failed to fetch NSE bulk deals: HTTP ${response.status}`);
      }

      const rows = parseCsv(String(response.data), {
        bom: true,
        columns: false,
        skip_empty_lines: true,
        relax_column_count: true,
        trim: true,
      }) as string[][];

      const deals: RawBulkDealRecord[] = [];

      for (const parts of rows.slice(1)) {
        if (parts.length < 7) continue;
        const [dateStr, symbolRaw, , clientNameRaw, dealTypeRaw, quantityRaw, priceRaw, remarksRaw = ''] = parts;
        const symbol = String(symbolRaw || '').trim().toUpperCase();
        const clientName = String(clientNameRaw || '').trim();
        const quantity = parseInt(String(quantityRaw || '').replace(/,/g, ''), 10);
        const price = parseFloat(String(priceRaw || '').replace(/,/g, ''));
        const tradeDate = new Date(dateStr || Date.now());

        if (!symbol || !clientName || !Number.isFinite(quantity) || !Number.isFinite(price) || quantity <= 0) {
          continue;
        }

        const buySell: 'BUY' | 'SELL' = String(dealTypeRaw || '').toUpperCase().startsWith('SELL') ? 'SELL' : 'BUY';
        const totalValueCr = Math.round(((quantity * price) / 10_000_000) * 100) / 100;

        deals.push({
          symbol,
          clientName,
          buySell,
          quantity,
          price,
          totalValueCr,
          tradeDate,
          remarks: String(remarksRaw).trim(),
        });
      }

      logger.info(`Parsed ${deals.length} bulk deal records from NSE CSV archive.`);
      return deals;
    },
    CONFIG.RETRY_ATTEMPTS,
    CONFIG.RETRY_DELAY_MS,
    'Fetch NSE Bulk Deals EOD'
  );
}
