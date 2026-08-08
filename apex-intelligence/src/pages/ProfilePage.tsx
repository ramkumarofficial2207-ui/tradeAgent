import React, { useState } from 'react';
import { 
  User as UserIcon, 
  Settings, 
  Wifi, 
  CheckCircle2, 
  ShieldCheck, 
  Crown, 
  Bell, 
  Send, 
  Key, 
  Lock,
  Layers,
  Save
} from 'lucide-react';
import { User } from '../types';
import { apiJson } from '../lib/api';

interface ProfilePageProps {
  user: User;
  onUpdatePreferences: (updatedData: any) => void;
}

export const ProfilePage: React.FC<ProfilePageProps> = ({ user, onUpdatePreferences }) => {
  const [tradingCapital, setTradingCapital] = useState<number>(user.tradingCapital || 0);
  const [maxRiskPct, setMaxRiskPct] = useState<number>(user.maxRiskPct || 0);
  const [maxPositions, setMaxPositions] = useState<number>(user.maxPositions || 0);
  const [maxSectorConc, setMaxSectorConc] = useState<number>(user.maxSectorConc || 0);

  const [telegramChatId, setTelegramChatId] = useState<string>(user.telegramChatId || '');
  const [notifyBuySignals, setNotifyBuySignals] = useState<boolean>(user.notifyBuySignals ?? true);
  const [notifyEmail, setNotifyEmail] = useState<boolean>(user.notifyEmail ?? true);

  const [isDhanConnected] = useState<boolean>(user.brokerConfig?.isConnectedDhan ?? false);
  const [isZerodhaConnected] = useState<boolean>(user.brokerConfig?.isConnectedZerodha ?? false);

  const [savedSuccess, setSavedSuccess] = useState<boolean>(false);

  const handleSaveAll = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdatePreferences({
      tradingCapital: Number(tradingCapital),
      maxRiskPct: Number(maxRiskPct),
      maxPositions: Number(maxPositions),
      maxSectorConc: Number(maxSectorConc),
      telegramChatId,
      notifyBuySignals,
      notifyEmail,
    });

    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3000);
  };

  const handleConnectZerodha = async () => {
    if (!user.isAdmin) return;
    try {
      const data = await apiJson<{ url: string }>('/api/kite/login');
      if (!data?.url) throw new Error('Kite login is unavailable.');
      window.location.assign(data.url);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-[#0D1117] border border-white/10 rounded-2xl p-6 shadow-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-white flex items-center gap-2">
            <Settings className="w-7 h-7 text-cyan-400" />
            User Profile & Broker Integrations
          </h1>
          <p className="text-xs text-gray-400 mt-1">
            Manage account subscription, broker connection status, notifications, and Risk Governor rules.
          </p>
        </div>

        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 text-xs font-mono font-bold">
          <Crown className="w-4 h-4 text-cyan-400" />
          <span>{user.subscriptionStatus} SUBSCRIPTION</span>
        </div>
      </div>

      {savedSuccess && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-4 text-emerald-300 text-xs font-bold flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          <span>Trading and notification preferences saved successfully.</span>
        </div>
      )}

      <form onSubmit={handleSaveAll} className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column (6 cols): Account & Risk Governor Form */}
        <div className="lg:col-span-6 space-y-6">
          {/* Account Profile Card */}
          <div className="bg-[#0D1117] border border-white/10 rounded-2xl p-5 shadow-xl space-y-4">
            <div className="flex items-center gap-3 border-b border-white/10 pb-3">
              <div className="w-10 h-10 rounded-xl bg-cyan-500/20 text-cyan-400 font-bold flex items-center justify-center text-sm">
                RS
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">{user.name}</h3>
                <p className="text-xs text-gray-400">{user.email} • {user.mobileNumber}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs font-mono">
              <div className="p-2.5 bg-[#080B10] rounded-xl border border-white/5">
                <span className="text-[10px] text-gray-400 block font-sans">Subscription Tier</span>
                <span className="text-emerald-400 font-bold text-xs uppercase">{user.subscriptionStatus}</span>
              </div>
              <div className="p-2.5 bg-[#080B10] rounded-xl border border-white/5">
                <span className="text-[10px] text-gray-400 block font-sans">Expiry Date</span>
                <span className="text-gray-200 font-bold text-xs">
                  {user.subscriptionExpiry ? new Date(user.subscriptionExpiry).toLocaleDateString('en-IN') : 'Unavailable'}
                </span>
              </div>
            </div>
          </div>

          {/* Risk Governor Rules Form */}
          <div className="bg-[#0D1117] border border-white/10 rounded-2xl p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-cyan-400" />
                Portfolio Risk Governor Rules
              </h3>
            </div>

            <div className="space-y-3 font-mono text-xs">
              <div>
                <label className="text-[11px] text-gray-400 block mb-1">Trading Capital Deployed (₹)</label>
                <input
                  type="number"
                  value={tradingCapital}
                  onChange={(e) => setTradingCapital(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-[#080B10] border border-white/10 rounded-xl text-white font-bold focus:border-cyan-500/50 outline-none"
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-[10px] text-gray-400 block mb-1">Max Risk % / Trade</label>
                  <input
                    type="number"
                    step="0.1"
                    value={maxRiskPct}
                    onChange={(e) => setMaxRiskPct(Number(e.target.value))}
                    className="w-full px-2.5 py-1.5 bg-[#080B10] border border-white/10 rounded-lg text-cyan-300 font-bold"
                  />
                </div>

                <div>
                  <label className="text-[10px] text-gray-400 block mb-1">Max Open Positions</label>
                  <input
                    type="number"
                    value={maxPositions}
                    onChange={(e) => setMaxPositions(Number(e.target.value))}
                    className="w-full px-2.5 py-1.5 bg-[#080B10] border border-white/10 rounded-lg text-white font-bold"
                  />
                </div>

                <div>
                  <label className="text-[10px] text-gray-400 block mb-1">Max Sector Conc</label>
                  <input
                    type="number"
                    value={maxSectorConc}
                    onChange={(e) => setMaxSectorConc(Number(e.target.value))}
                    className="w-full px-2.5 py-1.5 bg-[#080B10] border border-white/10 rounded-lg text-white font-bold"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column (6 cols): Broker Integrations & Alerts */}
        <div className="lg:col-span-6 space-y-6">
          {/* Broker Integration Cards */}
          <div className="bg-[#0D1117] border border-white/10 rounded-2xl p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Wifi className="w-4 h-4 text-emerald-400" />
                Live Broker API Connections
              </h3>
            </div>

            {/* Dhan API */}
            <div className="p-3.5 bg-[#080B10] rounded-xl border border-white/10 space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-bold text-white text-xs flex items-center gap-2">
                  Dhan API WebSocket Feed
                  <span className={`px-2 py-0.5 rounded text-[10px] font-mono ${isDhanConnected ? 'bg-emerald-500/10 text-emerald-400' : 'bg-gray-500/10 text-gray-400'}`}>
                    {isDhanConnected ? 'CONNECTED' : 'NOT CONFIGURED'}
                  </span>
                </span>
              </div>

              <p className="text-[11px] leading-relaxed text-gray-400">
                Broker credentials are managed on the server. Secret values are never returned to this page.
              </p>
            </div>

            {/* Zerodha Kite Connect */}
            <div className="p-3.5 bg-[#080B10] rounded-xl border border-white/10 space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-bold text-white text-xs flex items-center gap-2">
                  Zerodha Kite Connect OAuth
                  <span className={`px-2 py-0.5 rounded text-[10px] font-mono ${isZerodhaConnected ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'}`}>
                    {isZerodhaConnected ? 'AUTHORIZED 🟢' : 'NOT CONNECTED 🔴'}
                  </span>
                </span>
              </div>

              <button
                type="button"
                onClick={handleConnectZerodha}
                disabled={!user.isAdmin}
                className="w-full py-2 rounded-xl bg-cyan-500/15 hover:bg-cyan-500/25 disabled:opacity-50 disabled:cursor-not-allowed text-cyan-300 border border-cyan-500/30 text-xs font-bold transition-all"
              >
                {user.isAdmin ? 'Connect Zerodha Kite OAuth Session' : 'Broker OAuth is administrator-managed'}
              </button>
            </div>
          </div>

          {/* Notification Settings */}
          <div className="bg-[#0D1117] border border-white/10 rounded-2xl p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Bell className="w-4 h-4 text-cyan-400" />
                Telegram & Email Signal Notifications
              </h3>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="text-[11px] text-gray-400 block mb-1 font-mono">Telegram Chat ID / Bot Username</label>
                <input
                  type="text"
                  placeholder="@ApexScanTrader_Bot or 12345678"
                  value={telegramChatId}
                  onChange={(e) => setTelegramChatId(e.target.value)}
                  className="w-full px-3 py-2 bg-[#080B10] border border-white/10 rounded-xl text-white font-mono"
                />
              </div>

              <div className="flex items-center justify-between p-2.5 bg-[#080B10] rounded-xl border border-white/5">
                <span className="text-gray-300 font-medium">Instant Telegram Buy Signals</span>
                <input
                  type="checkbox"
                  checked={notifyBuySignals}
                  onChange={(e) => setNotifyBuySignals(e.target.checked)}
                  className="w-4 h-4 accent-cyan-400 rounded cursor-pointer"
                />
              </div>

              <div className="flex items-center justify-between p-2.5 bg-[#080B10] rounded-xl border border-white/5">
                <span className="text-gray-300 font-medium">Daily Evening Digest Email</span>
                <input
                  type="checkbox"
                  checked={notifyEmail}
                  onChange={(e) => setNotifyEmail(e.target.checked)}
                  className="w-4 h-4 accent-cyan-400 rounded cursor-pointer"
                />
              </div>
            </div>
          </div>

          <button
            type="submit"
            className="w-full py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-emerald-500 hover:from-cyan-400 hover:to-emerald-400 text-black font-extrabold text-xs flex items-center justify-center gap-2 shadow-lg shadow-cyan-500/20 transition-all"
          >
            <Save className="w-4 h-4" />
            <span>Save All Profile & Broker Settings</span>
          </button>
        </div>
      </form>
    </div>
  );
};

