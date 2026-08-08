import { claudeAsk } from '../claudeClient';
import { groqAsk } from '../groqClient';
import { geminiAsk } from '../geminiClient';
import prisma from '../prismaClient';
import { getLiveIndexPrices, getMarketStatus } from '../liveMarket';
import { getInstitutionalFlowSummary } from '../institutionalFlowService';

export interface RiskCalculatorInput {
  portfolioCapital: number;
  maxRiskPct: number;
  entryPrice: number;
  stopLoss: number;
  regime: 'BULLISH' | 'BEARISH' | 'NEUTRAL' | 'RISK_OFF';
}

export interface RiskCalculatorResult {
  portfolioCapital: number;
  maxRiskPct: number;
  entryPrice: number;
  stopLoss: number;
  riskPerShare: number;
  riskPctPerShare: number;
  allowedRiskCapital: number;
  calculatedQuantity: number;
  capitalDeployed: number;
  maxLoss: number;
  target1Price: number;
  target2Price: number;
  positionSizePctOfPortfolio: number;
  isCapExceeded: boolean;
  warnings: string[];
}

/**
 * Senior Backend Dev Risk & Position Governor Engine
 */
export function calculateRiskAndPosition(input: RiskCalculatorInput): RiskCalculatorResult {
  const {
    portfolioCapital,
    maxRiskPct,
    entryPrice,
    stopLoss,
    regime,
  } = input;

  const warnings: string[] = [];

  if (![portfolioCapital, maxRiskPct, entryPrice, stopLoss].every(Number.isFinite)) {
    throw new Error('All risk inputs must be finite numbers.');
  }
  if (portfolioCapital <= 0 || maxRiskPct <= 0 || entryPrice <= 0 || stopLoss <= 0) {
    throw new Error('Entry price and Stop Loss must be greater than zero.');
  }

  if (stopLoss >= entryPrice) {
    throw new Error('Stop Loss must be strictly below Entry Price for long setups.');
  }

  const regimeMultiplier = regime === 'BULLISH' ? 1.0 : regime === 'NEUTRAL' ? 0.75 : 0.5;

  const riskPerShare = entryPrice - stopLoss;
  const riskPctPerShare = (riskPerShare / entryPrice) * 100;

  // Max Risk Capital allowed for this trade
  const allowedRiskCapital = (portfolioCapital * (maxRiskPct / 100)) * regimeMultiplier;

  // Calculated Quantity (floored to whole shares)
  let calculatedQuantity = Math.floor(allowedRiskCapital / riskPerShare);

  if (calculatedQuantity < 1) {
    calculatedQuantity = 0;
    warnings.push('Risk per share exceeds total allowed risk capital. Minimum 1 share cannot be safely bought.');
  }

  const capitalDeployed = calculatedQuantity * entryPrice;
  const maxLoss = calculatedQuantity * riskPerShare;

  // Portfolio concentration check (max 35% of total capital in a single stock)
  const maxPositionCap = portfolioCapital * 0.35;
  let isCapExceeded = false;

  if (capitalDeployed > maxPositionCap) {
    isCapExceeded = true;
    warnings.push(`Position size (₹${capitalDeployed.toLocaleString('en-IN')}) exceeds 35% single-stock concentration cap.`);
  }

  // Targets (1:2 and 1:3 R:R)
  const target1Price = Math.round((entryPrice + (2 * riskPerShare)) * 100) / 100;
  const target2Price = Math.round((entryPrice + (3 * riskPerShare)) * 100) / 100;

  const positionSizePctOfPortfolio = Math.round((capitalDeployed / portfolioCapital) * 1000) / 10;

  return {
    portfolioCapital,
    maxRiskPct,
    entryPrice: Math.round(entryPrice * 100) / 100,
    stopLoss: Math.round(stopLoss * 100) / 100,
    riskPerShare: Math.round(riskPerShare * 100) / 100,
    riskPctPerShare: Math.round(riskPctPerShare * 100) / 100,
    allowedRiskCapital: Math.round(allowedRiskCapital * 100) / 100,
    calculatedQuantity,
    capitalDeployed: Math.round(capitalDeployed * 100) / 100,
    maxLoss: Math.round(maxLoss * 100) / 100,
    target1Price,
    target2Price,
    positionSizePctOfPortfolio,
    isCapExceeded,
    warnings,
  };
}

/**
 * Enhanced Gemini-Powered Grounded Multi-LLM Chat Engine
 */
export async function querySignalLabsAi(prompt: string, modelChoice: string = 'gemini'): Promise<{ modelUsed: string; response: string }> {
  try {
    // 1. Fetch Real-time Market Indices & Regime Context
    const liveIndices = await getLiveIndexPrices().catch(() => ({
      nifty: 0,
      bankNifty: 0,
      sensex: 0,
      indiaVix: 0,
      change: { nifty: 0, bankNifty: 0, sensex: 0, indiaVix: 0 },
      fetchedAt: new Date().toISOString(),
      source: 'unavailable',
    }));
    const marketClock = getMarketStatus();
    const marketStatus = {
      regime: 'UNAVAILABLE',
      regimeScore: null,
      positionSizeMult: null,
      session: marketClock.label,
    };


    // 2. Fetch Macro FII vs DII Net Flows
    const flowSummary = await getInstitutionalFlowSummary().catch(() => ({ series: [] }));
    const latestMacroFlow = flowSummary.series[0]
      ? `FII: ${flowSummary.series[0].fiiNet} Cr | DII: ${flowSummary.series[0].diiNet} Cr`
      : 'Institutional flow data unavailable';

    // 3. Fetch Active Super Signals & Institutional Deals from Database
    const recentDeals = await prisma.institutionalDeal.findMany({
      orderBy: { tradeDate: 'desc' },
      take: 8,
    });

    const superSignals = await prisma.institutionalConfluence.findMany({
      where: { isSuperSignal: true },
      orderBy: { confluenceScore: 'desc' },
      take: 5,
    });

    const dealsSummary = recentDeals.map(d => `- ${d.symbol} (${d.dealType}): ${d.clientName} [${d.entityType}] ₹${d.totalValue} Cr @ ₹${d.price}`).join('\n');
    const signalsSummary = superSignals.map(s => `- ${s.symbol}: Confluence Score ${s.confluenceScore}/100 | FII Net: ₹${s.netFiiBuyCr}Cr | DII Net: ₹${s.netDiiBuyCr}Cr`).join('\n');

    // 4. Construct System Instruction for Gemini / Multi-LLM
    const systemInstruction = `You are the Chief Investment Officer & Lead Quantitative Risk Officer for Signal Labs Quantitative Desk.
You analyze Indian Stock Market (NSE/BSE) institutional smart money flows, FII/DII bulk deals, technical setups, and risk governor parameters.

REAL-TIME GROUNDED CONTEXT:
• Live Benchmarks: Nifty 50: ${liveIndices.nifty || 'Unavailable'} | Bank Nifty: ${liveIndices.bankNifty || 'Unavailable'} | Sensex: ${liveIndices.sensex || 'Unavailable'}
• Market Regime: ${marketStatus.regime} | Session: ${marketStatus.session} | Score: Unavailable | Sizing Multiplier: Unavailable
• Macro Net Flows: ${latestMacroFlow}

[Active Super Signals (Technical + Institutional Confluence)]
${signalsSummary || 'No active super signals today.'}

[Recent Stock-Wise Bulk & Block Deals]
${dealsSummary || 'No recent deals available.'}

INSTRUCTIONS:
1. Provide highly structured, authoritative, quantitative analysis formatted in clean markdown.
2. Structure your answers with clear sections:
   - 🎯 **Executive Market Verdict**
   - 🏛️ **Institutional Smart Money Flow Analysis**
   - 🛡️ **Risk Governor Recommendation**
   - ⚡ **Actionable Trade Setup List**
3. Use precise numbers in ₹ Crores and percentages. Never state vague generic advice.`;

    let responseText = '';
    let modelUsed = 'Gemini 3.6 Flash';

    // Primary Single Model Engine: Gemini 3.6 Flash
    try {
      responseText = await geminiAsk(systemInstruction, prompt, { maxTokens: 1200, temperature: 0.3 });
    } catch (err: any) {
      // Fallback to Groq / Claude if Gemini API encounters temporary rate limit
      try {
        responseText = await groqAsk(systemInstruction, prompt);
        modelUsed = 'Llama 3 70B (Fallback)';
      } catch {
        responseText = await claudeAsk(systemInstruction, prompt);
        modelUsed = 'Claude 3.5 (Fallback)';
      }
    }


    return {
      modelUsed,
      response: responseText || 'Unable to generate response. Please try again.',
    };
  } catch (error: any) {
    console.error('[SignalLabs AI Chat Error]:', error.message);
    return {
      modelUsed: modelChoice,
      response: `AI Assistant Error: ${error.message}. Defaulting to Quantitative Rule Engine.`,
    };
  }
}
