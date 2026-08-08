import React from 'react';
import { 
  LayoutGrid, 
  Activity, 
  Star, 
  Briefcase, 
  BarChart3, 
  HelpCircle, 
  User,
  Sparkles,
  LogIn
} from 'lucide-react';
import { ApexLogo } from './ApexLogo';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeTab, setActiveTab }) => {
  const navItems = [
    { id: 'dashboard', label: 'Market Scanner', icon: LayoutGrid },
    { id: 'labs', label: 'Signal Labs AI', icon: Activity },
    { id: 'watchlist', label: 'Watchlist', icon: Star },
    { id: 'portfolio', label: 'Portfolio', icon: Briefcase },
    { id: 'track-record', label: 'Track Record', icon: BarChart3 },
  ];

  return (
    <aside className="w-16 bg-[#080B10] border-r border-white/10 flex flex-col items-center justify-between py-4 shrink-0 z-30 min-h-screen sticky top-0">
      {/* Top Logo Mark */}
      <div className="flex flex-col items-center gap-6">
        <button 
          onClick={() => setActiveTab('dashboard')}
          className="w-9 h-9 rounded-xl bg-[#0D1117] border border-white/15 flex items-center justify-center shadow-lg shadow-indigo-500/10 hover:scale-105 hover:border-cyan-500/50 transition-all"
          title="APEX Intelligence Home"
        >
          <ApexLogo className="w-6 h-6" />
        </button>

        {/* Nav Icons */}
        <nav className="flex flex-col items-center gap-3">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all relative group ${
                  isActive
                    ? 'bg-indigo-600/20 text-cyan-400 border border-cyan-500/40 shadow-md shadow-indigo-500/10'
                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                }`}
                title={item.label}
              >
                <Icon className={`w-5 h-5 ${isActive ? 'text-cyan-400' : ''}`} />
                {isActive && (
                  <span className="absolute right-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-cyan-400 rounded-l-full shadow-sm shadow-cyan-400/50" />
                )}

                {/* Tooltip on hover */}
                <span className="absolute left-14 bg-[#121824] border border-white/10 text-white text-xs font-semibold px-2.5 py-1 rounded-lg shadow-xl opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50 transition-opacity">
                  {item.label}
                </span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Bottom Action / Profile Icons */}
      <div className="flex flex-col items-center gap-3">
        <button 
          onClick={() => setActiveTab('profile')}
          className="w-10 h-10 rounded-xl text-gray-400 hover:text-white hover:bg-white/5 flex items-center justify-center transition-all"
          title="Help & Info"
        >
          <HelpCircle className="w-5 h-5" />
        </button>

        <button
          onClick={() => setActiveTab('profile')}
          className="w-8 h-8 rounded-full bg-indigo-600/30 border border-indigo-500/50 text-cyan-300 font-bold text-xs flex items-center justify-center hover:ring-2 hover:ring-cyan-400 transition-all"
          title="Account Profile"
        >
          R
        </button>
      </div>
    </aside>
  );
};
