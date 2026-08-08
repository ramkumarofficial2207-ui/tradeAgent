import React from 'react';
import { 
  TrendingUp, 
  TrendingDown, 
  Search, 
  Bell, 
  User as UserIcon,
  LogOut
} from 'lucide-react';
import { LiveIndex, User, InstitutionalFlowSnapshot } from '../types';
import { INITIAL_USER, INITIAL_FLOW } from '../data/initialData';

interface TopbarProps {
  activePage?: string;
  setActivePage?: (page: string) => void;
  onLogout?: () => void;
  indices?: LiveIndex[];
  user?: User;
  institutionalFlow?: InstitutionalFlowSnapshot;
  watchlistCount?: number;
  openTradesCount?: number;
}

export const Topbar: React.FC<TopbarProps> = ({
  activePage = 'dashboard',
  setActivePage = (_page: string) => {},
  onLogout,
  indices = [],
  user = INITIAL_USER,
  institutionalFlow = INITIAL_FLOW,
}) => {
  const safeIndices = Array.isArray(indices) ? indices : [];
  // Deduplicate items by symbol to prevent duplicate BANKNIFTY/NIFTY50 items
  const uniqueIndices = Array.from(new Map(safeIndices.map(item => [item?.symbol || item?.name, item])).values());
  // Duplicate deduplicated list for seamless infinite loop ticker animation
  const tickerItems = [...uniqueIndices, ...uniqueIndices];


  return (
    <header className="sticky top-0 z-40 bg-[#080B10] border-b border-white/10 px-4 py-2.5 flex items-center justify-between gap-4 text-xs select-none">
      {/* Brand Title & Live Auto-Scrolling Marquee Banner */}
      <div className="flex items-center gap-5 overflow-hidden flex-1 min-w-0">
        <div 
          onClick={() => setActivePage('dashboard')}
          className="flex items-center gap-2 cursor-pointer shrink-0 hover:opacity-90 transition-opacity"
        >
          <span className="font-extrabold text-base sm:text-lg bg-gradient-to-r from-white via-slate-100 to-cyan-400 bg-clip-text text-transparent tracking-tight font-sans">
            APEX Intelligence
          </span>
          <span className="hidden xl:inline-block px-1.5 py-0.5 text-[9px] font-mono font-bold uppercase rounded bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
            {user.subscriptionStatus}
          </span>
        </div>

        {/* Live Running Marquee Ticker Banner */}
        <div className="hidden lg:flex items-center overflow-hidden flex-1 min-w-0 relative max-w-xl xl:max-w-3xl [mask-image:linear-gradient(to_right,transparent,black_20px,black_calc(100%-20px),transparent)]">
          <div className="animate-ticker flex items-center gap-2.5">
            {tickerItems.length === 0 && <span className="text-[11px] text-gray-500">Market data unavailable</span>}
            {tickerItems.map((idx, i) => {
              const isUp = (idx?.changePct ?? 0) >= 0;
              const isFlow = (idx as any)?.isFlow;
              return (
                <div 
                  key={`${idx?.symbol || idx?.name}-${i}`} 
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#0D1117] border border-white/10 hover:border-cyan-500/40 font-mono text-[11px] shrink-0 transition-colors cursor-pointer"
                  onClick={() => window.dispatchEvent(new CustomEvent('open-stock-modal', { detail: { ticker: idx?.symbol } }))}
                >
                  <span className="text-gray-400 font-sans font-semibold text-[10px]">{idx?.name}</span>
                  <span className="text-white font-bold">
                    {isFlow ? `+₹${idx?.ltp} Cr` : `₹${(idx?.ltp ?? 0).toLocaleString('en-IN', { minimumFractionDigits: isFlow ? 1 : 2 })}`}
                  </span>
                  <span className={`flex items-center font-bold text-[10px] ${isUp ? 'text-emerald-400' : 'text-red-400'}`}>
                    {isUp ? <TrendingUp className="w-2.5 h-2.5 mr-0.5" /> : <TrendingDown className="w-2.5 h-2.5 mr-0.5" />}
                    {isUp ? '+' : ''}{(idx?.changePct ?? 0).toFixed(2)}%
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Right Search & Controls */}
      <div className="flex items-center gap-3 shrink-0">
        {/* Search Input Box */}
        <div 
          onClick={() => {
            const ticker = window.prompt('Enter an NSE ticker symbol');
            if (ticker && /^[A-Z0-9&.-]{1,20}$/i.test(ticker.trim())) {
              window.dispatchEvent(new CustomEvent('open-stock-modal', { detail: { ticker: ticker.trim().toUpperCase() } }));
            }
          }}
          className="relative hidden sm:flex items-center w-48 md:w-60 px-3 py-1.5 bg-[#0D1117] border border-white/10 hover:border-cyan-500/50 rounded-xl text-xs text-gray-400 font-sans cursor-pointer transition-all group"
        >
          <Search className="w-3.5 h-3.5 text-gray-400 mr-2 group-hover:text-cyan-400" />
          <span className="flex-1 truncate">360° Stock Audit...</span>
          <span className="text-[10px] font-mono text-gray-500 bg-white/5 px-1.5 py-0.5 rounded border border-white/5">
            Ctrl+K
          </span>
        </div>

        {/* Notifications Bell */}
        <button className="w-8 h-8 rounded-lg bg-[#0D1117] border border-white/10 hover:border-white/20 text-gray-300 flex items-center justify-center transition-colors relative">
          <Bell className="w-4 h-4" />
        </button>

        {/* Logout Button */}
        <button
          onClick={onLogout || (() => setActivePage('login'))}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 font-mono text-xs font-semibold transition-all cursor-pointer shrink-0"
          title="Log Out of Terminal"
        >
          <LogOut className="w-3.5 h-3.5 text-red-400" />
          <span className="hidden sm:inline">Logout</span>
        </button>

        {/* Profile Avatar Button */}
        <button 
          onClick={() => setActivePage('profile')}
          className="w-8 h-8 rounded-full bg-indigo-600/30 border border-indigo-500/50 text-cyan-300 font-bold text-xs flex items-center justify-center hover:ring-2 hover:ring-cyan-400 transition-all shrink-0"
          title="Account Profile"
        >
          {user?.name ? user.name.charAt(0).toUpperCase() : '?'}
        </button>
      </div>
    </header>
  );
};


