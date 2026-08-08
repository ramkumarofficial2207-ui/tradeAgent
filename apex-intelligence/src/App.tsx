import React, { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { Topbar } from './components/Topbar';
import { DashboardPage } from './pages/DashboardPage';
import { SignalLabsPage } from './pages/SignalLabsPage';
import { WatchlistPage } from './pages/WatchlistPage';
import { PortfolioPage } from './pages/PortfolioPage';
import { TrackRecordPage } from './pages/TrackRecordPage';
import { ProfilePage } from './pages/ProfilePage';
import { UpgradePage } from './pages/UpgradePage';
import { RegisterPage } from './pages/RegisterPage';
import { LoginPage } from './pages/LoginPage';

import { LogTradeModal } from './components/LogTradeModal';
import { DeepAnalysisModal } from './components/DeepAnalysisModal';
import { ExitTradeModal } from './components/ExitTradeModal';
import { StockDeepDiveModal } from './components/StockDeepDiveModal';

import { ScanItem, WatchlistItem, Trade, User, InstitutionalFlowSnapshot, LiveIndex, MarketStatus } from './types';
import { INITIAL_USER, LIVE_INDICES, MARKET_STATUS, INITIAL_FLOW, INITIAL_SCAN_ITEMS, INITIAL_TRADES, INITIAL_WATCHLIST } from './data/initialData';
import { apiJson } from './lib/api';
import { normalizeScanItems } from './lib/scanItems';

type ScanLifecycleStatus = {
  id: string;
  status: 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'TIMED_OUT';
  stage: string;
  message?: string | null;
  progressPct: number;
  processedStocks: number;
  totalStocks: number;
  setupsFound: number;
  trigger: 'manual' | 'scheduled' | 'closing';
  error?: string | null;
  completedAt?: string | null;
};

export default function App() {
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [authToken, setAuthToken] = useState<string | null>(() => localStorage.getItem('token'));
  
  // Data States
  const [user, setUser] = useState<User>(INITIAL_USER);
  const [indices, setIndices] = useState<LiveIndex[]>(LIVE_INDICES);
  const [marketStatus, setMarketStatus] = useState<MarketStatus>(MARKET_STATUS);
  const [scanItems, setScanItems] = useState<ScanItem[]>(INITIAL_SCAN_ITEMS);
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>(INITIAL_WATCHLIST);
  const [trades, setTrades] = useState<Trade[]>(INITIAL_TRADES);
  const [institutionalFlow, setInstitutionalFlow] = useState<InstitutionalFlowSnapshot>(INITIAL_FLOW);

  // Modal States
  const [logTradeItem, setLogTradeItem] = useState<ScanItem | null>(null);
  const [deepAnalysisItem, setDeepAnalysisItem] = useState<ScanItem | null>(null);
  const [exitTradeItem, setExitTradeItem] = useState<Trade | null>(null);

  // Scanning Progress SSE States
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [scanProgressStep, setScanProgressStep] = useState<string>('');
  const [scanProgressPct, setScanProgressPct] = useState<number>(0);
  const [scanProcessedStocks, setScanProcessedStocks] = useState<number>(0);
  const [scanTotalStocks, setScanTotalStocks] = useState<number>(0);
  const [scanError, setScanError] = useState<string>('');
  const [autoScanEnabled, setAutoScanEnabled] = useState<boolean>(false);
  const [lastSuccessfulScanAt, setLastSuccessfulScanAt] = useState<string | null>(null);

  // Initial Data Fetching
  useEffect(() => {
    if (!authToken) return;

    const safeFetchJson = async (url: string) => apiJson<any>(url).catch((err) => {
      console.error(`Fetch error for ${url}:`, err);
      return null;
    });

    // 1. Fetch User Profile
    safeFetchJson('/api/auth/me').then((d) => {
      if (d?.user) setUser(d.user);
    });

    // 2. Fetch Active Setups
    safeFetchJson('/api/last').then((d) => {
      if (Array.isArray(d?.data?.setups)) {
        setScanItems(normalizeScanItems(d.data.setups));
        setLastSuccessfulScanAt(d.data.timestamp || null);
      }
    });

    // 3. Fetch Watchlist
    safeFetchJson('/api/watchlist').then((d) => {
      if (Array.isArray(d?.data)) setWatchlist(d.data);
    });

    // 4. Fetch Portfolio Trades
    safeFetchJson('/api/portfolio/trades').then((d) => {
      if (Array.isArray(d?.data)) setTrades(d.data);
      else if (Array.isArray(d?.openTrades)) setTrades([...d.openTrades, ...(d.closedTrades || [])]);
    });

    // 5. Fetch Institutional Flow
    safeFetchJson('/api/fii-dii').then((d) => {
      const latest = d?.data?.latest;
      if (latest) {
        setInstitutionalFlow({
          ...latest,
          id: latest.tradingDate,
          marketBias: latest.marketBias === 'RISK_ON' ? 'BULLISH' : latest.marketBias === 'RISK_OFF' ? 'BEARISH' : 'NEUTRAL',
        });
      }
    });

    // 6. Fetch Live Indices
    safeFetchJson('/api/live/market').then((d) => {
      const values = d?.data?.indices;
      if (!values) return;
      const rawStatus = d?.data?.marketStatus;
      if (rawStatus) {
        const label = String(rawStatus.label || '');
        setMarketStatus({
          isOpen: Boolean(rawStatus.isOpen),
          session: rawStatus.isOpen
            ? 'REGULAR'
            : label.toLowerCase().includes('pre')
              ? 'PRE_MARKET'
              : label.toLowerCase().includes('after')
                ? 'POST_MARKET'
                : 'CLOSED',
          lastUpdated: values.fetchedAt || new Date().toISOString(),
          label: label || undefined,
          nextEvent: rawStatus.nextEvent || undefined,
        });
      }
      const toIndex = (symbol: string, name: string, ltp: number, changePct: number): LiveIndex => ({
        symbol,
        name,
        ltp,
        changePct,
        change: ltp > 0 ? (ltp * changePct) / 100 : 0,
      });
      setIndices([
        toIndex('NIFTY', 'Nifty 50', values.nifty, values.change?.nifty ?? 0),
        toIndex('BANKNIFTY', 'Bank Nifty', values.bankNifty, values.change?.bankNifty ?? 0),
        toIndex('SENSEX', 'Sensex', values.sensex, values.change?.sensex ?? 0),
      ].filter(index => index.ltp > 0));
    });
  }, [authToken]);

  // Durable scanner polling restores an active job after refresh and also
  // publishes scheduled results without requiring the manual scan button.
  useEffect(() => {
    if (!authToken) return;
    let cancelled = false;
    let loadedScanTimestamp: string | null = null;

    const loadLatestSetups = async () => {
      const payload = await apiJson<any>('/api/last');
      if (cancelled || !Array.isArray(payload?.data?.setups)) return;
      setScanItems(normalizeScanItems(payload.data.setups));
      loadedScanTimestamp = payload.data.timestamp || null;
      setLastSuccessfulScanAt(loadedScanTimestamp);
    };

    const refreshScanStatus = async () => {
      try {
        const response = await apiJson<any>('/api/scan/status');
        if (cancelled) return;
        const snapshot = response?.data;
        setAutoScanEnabled(Boolean(snapshot?.autoScanEnabled));

        const active = snapshot?.active as ScanLifecycleStatus | null;
        const latest = snapshot?.latest as ScanLifecycleStatus | null;
        if (active) {
          setIsScanning(true);
          setScanError('');
          setScanProgressPct(Number(active.progressPct) || 0);
          setScanProgressStep(active.message || active.stage || 'Running market scan...');
          setScanProcessedStocks(Number(active.processedStocks) || 0);
          setScanTotalStocks(Number(active.totalStocks) || 0);
        } else {
          setIsScanning(false);
          if (latest?.status === 'FAILED' || latest?.status === 'TIMED_OUT') {
            setScanError(latest.error || latest.message || 'The latest scan did not complete.');
            setScanProgressStep(latest.message || latest.stage);
          } else {
            setScanError('');
            if (latest?.status === 'COMPLETED') {
              setScanProgressPct(100);
              setScanProgressStep(latest.message || 'Scan completed.');
            }
          }
        }

        const successfulAt = snapshot?.lastSuccessfulScanAt || null;
        if (successfulAt && successfulAt !== loadedScanTimestamp) {
          await loadLatestSetups();
        }
      } catch (error) {
        console.error('Unable to refresh scanner status:', error);
      }
    };

    void refreshScanStatus();
    const interval = window.setInterval(refreshScanStatus, 5_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [authToken]);

  useEffect(() => {
    const handleUnauthorized = () => {
      setAuthToken(null);
      setActiveTab('login');
    };
    window.addEventListener('auth:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('auth:unauthorized', handleUnauthorized);
  }, []);

  // Watchlist Actions
  const handleAddToWatchlist = async (item: ScanItem) => {
    try {
      const data = await apiJson<{ data: WatchlistItem }>('/api/watchlist', {
        method: 'POST',
        body: JSON.stringify({
          ticker: item.ticker,
          signal: item.aiSignal || (item.status === 'TRIGGERED' ? 'BUY' : 'WATCH'),
          buyZone: item.buyZoneMin,
          target: item.target1,
          stopLoss: item.stopLoss,
          confidenceScore: item.confidenceScore,
          sector: item.sector,
          setupType: item.setupType,
          ltp: item.ltp,
          snapshot: { aiReasons: item.aiReasons ?? [], scannerTimestamp: new Date().toISOString() },
        }),
      });
      const newItem = data.data;
      setWatchlist((prev) => [newItem, ...prev.filter(w => w.id !== newItem.id)]);
    } catch (err) {
      console.error(err);
    }
  };

  const handleRemoveFromWatchlist = async (id: string) => {
    try {
      const item = watchlist.find(entry => entry.id === id);
      if (!item) return;
      await apiJson(`/api/watchlist/${encodeURIComponent(item.ticker)}`, { method: 'DELETE' });
      setWatchlist((prev) => prev.filter((w) => w.id !== id));
    } catch (err) {
      console.error(err);
    }
  };

  // Trade Logging Actions
  const handleConfirmLogTrade = async (tradeData: any) => {
    try {
      const data = await apiJson<{ trade: Trade }>('/api/portfolio/trades', {
        method: 'POST',
        body: JSON.stringify(tradeData),
      });
      const newTrade = data.trade;
      if (newTrade?.id) {
        setTrades((prev) => [newTrade, ...prev]);
      }
      setLogTradeItem(null);
    } catch (err) {
      console.error(err);
    }
  };

  // Exit Trade Actions
  const handleConfirmExitTrade = async (tradeId: string, exitData: any) => {
    try {
      const data = await apiJson<{ trade: Trade }>(`/api/portfolio/trades/${tradeId}`, {
        method: 'PATCH',
        body: JSON.stringify(exitData),
      });
      const updatedTrade = data.trade;
      if (updatedTrade?.id) {
        setTrades((prev) => prev.map((t) => (t.id === tradeId ? updatedTrade : t)));
      }
      setExitTradeItem(null);
    } catch (err) {
      console.error(err);
    }
  };

  const handleUpdateTrailingStop = async (tradeId: string, newStop: number) => {
    try {
      const data = await apiJson<{ trade: Trade }>(`/api/portfolio/trades/${tradeId}`, {
        method: 'PATCH',
        body: JSON.stringify({ stopLossTrail: newStop }),
      });
      const updatedTrade = data.trade;
      if (updatedTrade?.id) {
        setTrades((prev) => prev.map((t) => (t.id === tradeId ? updatedTrade : t)));
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Profile Update Action
  const handleUpdatePreferences = async (updatedData: any) => {
    try {
      const { tradingCapital, maxRiskPct, maxPositions, maxSectorConc, ...preferences } = updatedData;
      const [profile, capital] = await Promise.all([
        apiJson<{ data: Partial<User> }>('/api/user/preferences', {
          method: 'POST',
          body: JSON.stringify(preferences),
        }),
        apiJson<{ data: Partial<User> }>('/api/user/capital', {
          method: 'PUT',
          body: JSON.stringify({ tradingCapital, maxRiskPct, maxPositions, maxSectorConc }),
        }),
      ]);
      setUser(prev => ({ ...prev, ...profile.data, ...capital.data }));
    } catch (err) {
      console.error(err);
    }
  };

  // Manual fallback uses the same durable coordinator as scheduled scans.
  const handleTriggerRealtimeScan = async () => {
    if (isScanning) return;
    setIsScanning(true);
    setScanProgressPct(0);
    setScanProcessedStocks(0);
    setScanTotalStocks(0);
    setScanError('');
    setScanProgressStep('Queueing the market scan...');

    try {
      const response = await apiJson<{ scan: ScanLifecycleStatus }>('/api/scans', { method: 'POST' });
      const scan = response.scan;
      setScanProgressPct(Number(scan?.progressPct) || 0);
      setScanProgressStep(scan?.message || scan?.stage || 'Market scan queued.');
      setScanProcessedStocks(Number(scan?.processedStocks) || 0);
      setScanTotalStocks(Number(scan?.totalStocks) || 0);
    } catch (error: any) {
      const message = error?.message || 'Unable to start the scan.';
      setScanProgressStep(message);
      setScanError(message);
      setIsScanning(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    setAuthToken(null);
    setActiveTab('login');
  };

  const watchlistTickerSet = new Set((watchlist || []).map((w) => w.ticker));

  if (!authToken) {
    if (activeTab === 'register') {
      return (
        <RegisterPage
          onSuccessRegister={(updatedUser) => {
            setUser(updatedUser);
            setAuthToken(localStorage.getItem('token'));
            setActiveTab('dashboard');
          }}
          onSwitchToLogin={() => setActiveTab('login')}
          onClose={() => setActiveTab('login')}
        />
      );
    }
    return (
      <LoginPage
        onSuccessLogin={(updatedUser) => {
          setUser(updatedUser);
          setAuthToken(localStorage.getItem('token'));
          setActiveTab('dashboard');
        }}
        onSwitchToRegister={() => setActiveTab('register')}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#0A0D14] text-gray-100 font-sans flex selection:bg-cyan-500/30 selection:text-cyan-200">
      {/* Left Navigation Rail Sidebar */}
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar with Ticker Marquee & Header Controls */}
        <Topbar
          activePage={activeTab}
          setActivePage={setActiveTab}
          onLogout={handleLogout}
          indices={indices}
          user={user}
          institutionalFlow={institutionalFlow}
          watchlistCount={watchlist.length}
          openTradesCount={(trades || []).filter((t) => t.status === 'OPEN').length}
        />

        {/* Main View Area */}
        <main className="flex-1 max-w-[1600px] w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {activeTab === 'dashboard' && (
            <DashboardPage
              scanItems={scanItems}
              user={user}
              institutionalFlow={institutionalFlow}
              indices={indices}
              marketStatus={marketStatus}
              watchlistIds={watchlistTickerSet}
              onAddToWatchlist={handleAddToWatchlist}
              onOpenLogTrade={(item) => setLogTradeItem(item)}
              onOpenDeepAnalysis={(item) => setDeepAnalysisItem(item)}
              onTriggerScan={handleTriggerRealtimeScan}
              isScanning={isScanning}
              scanProgressStep={scanProgressStep}
              scanProgressPct={scanProgressPct}
              scanProcessedStocks={scanProcessedStocks}
              scanTotalStocks={scanTotalStocks}
              scanError={scanError}
              autoScanEnabled={autoScanEnabled}
              lastSuccessfulScanAt={lastSuccessfulScanAt}
            />
          )}

          {activeTab === 'labs' && (
            <SignalLabsPage 
              scanItems={scanItems} 
              user={user} 
              onOpenDeepAnalysis={(item) => setDeepAnalysisItem(item)}
            />
          )}

          {activeTab === 'watchlist' && (
            <WatchlistPage
              watchlist={watchlist}
              onRemoveItem={handleRemoveFromWatchlist}
              onOpenLogTrade={(item) => setLogTradeItem(item)}
            />
          )}

          {activeTab === 'portfolio' && (
            <PortfolioPage
              user={user}
              trades={trades}
              onOpenExitModal={(t) => setExitTradeItem(t)}
              onUpdateTrailingStop={handleUpdateTrailingStop}
            />
          )}

          {activeTab === 'track-record' && <TrackRecordPage />}

          {activeTab === 'profile' && (
            <ProfilePage user={user} onUpdatePreferences={handleUpdatePreferences} />
          )}

          {activeTab === 'upgrade' && <UpgradePage />}

          {activeTab === 'register' && (
            <RegisterPage
              onSuccessRegister={(updatedUser) => {
                setUser(updatedUser);
                setAuthToken(localStorage.getItem('token'));
                setActiveTab('dashboard');
              }}
              onSwitchToLogin={() => setActiveTab('login')}
              onClose={() => setActiveTab('dashboard')}
            />
          )}

          {activeTab === 'login' && (
            <LoginPage
              onSuccessLogin={(updatedUser) => {
                setUser(updatedUser);
                setAuthToken(localStorage.getItem('token'));
                setActiveTab('dashboard');
              }}
              onSwitchToRegister={() => setActiveTab('register')}
              onClose={() => setActiveTab('dashboard')}
            />
          )}
        </main>
      </div>

      {/* Modals */}
      <LogTradeModal
        item={logTradeItem}
        user={user}
        onClose={() => setLogTradeItem(null)}
        onConfirmLogTrade={handleConfirmLogTrade}
      />

      <DeepAnalysisModal
        item={deepAnalysisItem}
        onClose={() => setDeepAnalysisItem(null)}
        onAddToWatchlist={handleAddToWatchlist}
        onOpenLogTrade={(item) => setLogTradeItem(item)}
        isInWatchlist={deepAnalysisItem ? watchlistTickerSet.has(deepAnalysisItem.ticker) : false}
      />

      <ExitTradeModal
        trade={exitTradeItem}
        onClose={() => setExitTradeItem(null)}
        onConfirmExit={handleConfirmExitTrade}
      />

      <StockDeepDiveModal />
    </div>
  );
}
