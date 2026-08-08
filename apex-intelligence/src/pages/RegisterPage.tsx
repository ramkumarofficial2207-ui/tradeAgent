import React, { useState } from 'react';
import { 
  User as UserIcon, 
  Mail, 
  Phone, 
  Lock, 
  KeyRound, 
  Eye, 
  EyeOff, 
  Sparkles, 
  CheckCircle2, 
  ShieldCheck, 
  ArrowRight, 
  Loader2,
  Zap,
  TrendingUp,
  X
} from 'lucide-react';
import { User } from '../types';
import { ApexLogo } from '../components/ApexLogo';
import { apiJson } from '../lib/api';

const MIN_PASSWORD_LENGTH = 10;
const MPIN_LENGTH = 6;

interface RegisterPageProps {
  onSuccessRegister?: (user: User) => void;
  onSwitchToLogin?: () => void;
  onClose?: () => void;
}

export const RegisterPage: React.FC<RegisterPageProps> = ({
  onSuccessRegister,
  onSwitchToLogin,
  onClose,
}) => {
  const [isLoginMode, setIsLoginMode] = useState<boolean>(false);

  // Registration state
  const [name, setName] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [mobileNumber, setMobileNumber] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [mpin, setMpin] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);

  // UI States
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [registeredUser, setRegisteredUser] = useState<User | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (isLoginMode) {
      // Handle Login
      if (!email || !password) {
        setError('Please fill in your email and password.');
        return;
      }

      setLoading(true);
      try {
        const data = await apiJson<any>('/api/auth/login', {
          method: 'POST',
          body: JSON.stringify({ email, password }),
        });

        if (data.token) {
          localStorage.setItem('token', data.token);
        }

        if (data.user && onSuccessRegister) {
          onSuccessRegister(data.user);
        }
      } catch (err: any) {
        setError(err.message || 'Login failed. Please try again.');
      } finally {
        setLoading(false);
      }
      return;
    }

    // Handle Registration
    if (!name.trim()) {
      setError('Please enter your full name.');
      return;
    }
    if (!email.trim() || !email.includes('@')) {
      setError('Please enter a valid email address.');
      return;
    }
    if (!password || password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters long.`);
      return;
    }
    if (!mpin || mpin.length !== MPIN_LENGTH) {
      setError(`Please set a valid ${MPIN_LENGTH}-digit quick MPIN.`);
      return;
    }

    setLoading(true);

    try {
      const data = await apiJson<any>('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          mobileNumber: mobileNumber.trim(),
          password,
          mpin,
        }),
      });

      // Save returned JWT token to localStorage as required
      if (data.token) {
        localStorage.setItem('token', data.token);
      }

      if (data.user) {
        setRegisteredUser(data.user);
        if (onSuccessRegister) {
          onSuccessRegister(data.user);
        }
      }
    } catch (err: any) {
      setError(err.message || 'Registration failed. Please check your network connection.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0D14] flex flex-col items-center justify-center p-4 sm:p-6 relative overflow-hidden select-none font-sans">
      {/* Background Ambient Glows */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-indigo-600/15 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-10 right-10 w-[350px] h-[350px] bg-emerald-500/10 blur-[100px] rounded-full pointer-events-none" />

      {/* Top Header Logo */}
      <div className="mb-6 flex items-center justify-between w-full max-w-[460px] z-10">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-[#0D1117] border border-white/15 flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <ApexLogo className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-lg font-black text-white tracking-tight">APEX Intelligence</h1>
            <p className="text-[10px] font-mono text-gray-400">Institutional Quantitative Intelligence</p>
          </div>
        </div>

        {onClose && (
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/5 border border-white/10 hover:bg-white/10 text-gray-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Form Glassmorphism Card Panel */}
      <div
        className="w-full max-w-[460px] z-10 p-6 sm:p-8 rounded-[20px] border border-white/10 shadow-2xl relative overflow-hidden transition-all duration-300"
        style={{
          background: 'rgba(16, 20, 30, 0.85)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
        }}
      >
        {/* Registration Success View State */}
        {registeredUser ? (
          <div className="py-6 text-center space-y-5 animate-in fade-in zoom-in duration-300">
            <div className="w-16 h-16 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center mx-auto shadow-lg shadow-emerald-500/20">
              <CheckCircle2 className="w-8 h-8 animate-bounce" />
            </div>

            <div className="space-y-1">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold font-mono bg-emerald-500/20 border border-emerald-500/40 text-emerald-400">
                🎁 7-Day Free Trial Activated
              </span>
              <h2 className="text-xl font-extrabold text-white">Welcome, {registeredUser.name}!</h2>
              <p className="text-xs text-gray-400 font-mono">
                Your quantitative trading desk account is active with full institutional scanner access.
              </p>
            </div>

            <div className="bg-[#080B10] p-4 rounded-xl border border-white/10 text-left space-y-2 text-xs font-mono">
              <div className="flex justify-between text-gray-400">
                <span>Account ID:</span>
                <span className="text-white font-bold">{registeredUser.id}</span>
              </div>
              <div className="flex justify-between text-gray-400">
                <span>Plan Tier:</span>
                <span className="text-emerald-400 font-bold">UNLIMITED PRO TRIAL</span>
              </div>
              <div className="flex justify-between text-gray-400">
                <span>Trial Expiry:</span>
                <span className="text-cyan-300 font-bold">{registeredUser.subscriptionExpiry || '7 Days Active'}</span>
              </div>
            </div>

            <button
              onClick={() => {
                if (onClose) onClose();
                else window.location.reload();
              }}
              className="w-full py-3.5 rounded-xl font-bold text-sm text-white flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-indigo-500/25 transition-transform hover:scale-[1.02]"
              style={{
                background: 'linear-gradient(135deg, #6366F1, #4F46E5)',
              }}
            >
              <span>🚀 Launch Quantitative Terminal</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        ) : (
          /* Form Content */
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Header Title & Pill Badge */}
            <div className="space-y-2">
              {/* Prominent Green Pill Badge */}
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#10B981]/15 border border-[#10B981]/40 text-[#10B981] text-[11px] font-bold font-mono shadow-sm">
                <span>🎁 7-Day Unlimited Free Trial Included</span>
              </div>

              <h2 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight font-sans">
                {isLoginMode ? 'Log In to Your Quantitative Desk' : 'Create Your Quantitative Desk Account'}
              </h2>
              <p className="text-xs text-gray-400 font-sans">
                {isLoginMode
                  ? 'Enter your email and password to access your terminal.'
                  : 'Get instant 1-click access to institutional scanners, FII/DII flow & AI setups.'}
              </p>
            </div>

            {/* Error Notification Alert Banner */}
            {error && (
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-mono flex items-start gap-2 animate-in fade-in duration-200">
                <span className="font-bold">⚠️</span>
                <span className="flex-1">{error}</span>
              </div>
            )}

            {/* Input Fields */}
            <div className="space-y-3 pt-1">
              {!isLoginMode && (
                /* 1. Full Name Input */
                <div className="space-y-1">
                  <label className="text-[11px] font-mono text-gray-300 font-medium flex items-center gap-1.5">
                    <UserIcon className="w-3.5 h-3.5 text-indigo-400" /> Full Name
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      required
                      placeholder="Enter your full name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-[#080B10] border border-white/10 focus:border-indigo-500/80 rounded-xl text-xs text-white placeholder-gray-500 outline-none transition-all font-sans"
                    />
                  </div>
                </div>
              )}

              {/* 2. Email Address Input */}
              <div className="space-y-1">
                <label className="text-[11px] font-mono text-gray-300 font-medium flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-indigo-400" /> Email Address
                </label>
                <div className="relative">
                  <input
                    type="email"
                    required
                    placeholder="name@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-[#080B10] border border-white/10 focus:border-indigo-500/80 rounded-xl text-xs text-white placeholder-gray-500 outline-none transition-all font-sans"
                  />
                </div>
              </div>

              {!isLoginMode && (
                /* 3. Mobile Number Input */
                <div className="space-y-1">
                  <label className="text-[11px] font-mono text-gray-300 font-medium flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5 text-indigo-400" /> Mobile Number
                  </label>
                  <div className="relative">
                    <input
                      type="tel"
                      placeholder="+91 98765 43210"
                      value={mobileNumber}
                      onChange={(e) => setMobileNumber(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-[#080B10] border border-white/10 focus:border-indigo-500/80 rounded-xl text-xs text-white placeholder-gray-500 outline-none transition-all font-mono"
                    />
                  </div>
                </div>
              )}

              {/* 4. Password Input */}
              <div className="space-y-1">
                <label className="text-[11px] font-mono text-gray-300 font-medium flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5 text-indigo-400" /> Password
                  </span>
                  {!isLoginMode && <span className="text-[10px] text-gray-500">(Min {MIN_PASSWORD_LENGTH} chars)</span>}
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    minLength={isLoginMode ? 1 : MIN_PASSWORD_LENGTH}
                    maxLength={128}
                    placeholder={isLoginMode ? 'Enter your password' : `Create secure password (min ${MIN_PASSWORD_LENGTH} chars)`}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-3.5 pr-10 py-2.5 bg-[#080B10] border border-white/10 focus:border-indigo-500/80 rounded-xl text-xs text-white placeholder-gray-500 outline-none transition-all font-sans"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition-colors cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {!isLoginMode && (
                /* 5. 6-Digit Quick MPIN Input */
                <div className="space-y-1 pt-0.5">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-mono text-gray-300 font-medium flex items-center gap-1.5">
                      <KeyRound className="w-3.5 h-3.5 text-cyan-400" /> {MPIN_LENGTH}-Digit Quick MPIN
                    </label>
                    <span className="text-[10px] text-cyan-400/90 font-mono font-medium">Quick 1-click mobile login</span>
                  </div>
                  <div className="relative">
                    <input
                      type="password"
                      required
                      inputMode="numeric"
                      minLength={MPIN_LENGTH}
                      maxLength={MPIN_LENGTH}
                      pattern={`[0-9]{${MPIN_LENGTH}}`}
                      placeholder={`Set ${MPIN_LENGTH}-digit PIN`}
                      value={mpin}
                      onChange={(e) => {
                        const val = e.target.value.replace(/\D/g, '');
                        if (val.length <= MPIN_LENGTH) setMpin(val);
                      }}
                      className="w-full px-3.5 py-2.5 bg-[#080B10] border border-white/10 focus:border-cyan-500/80 rounded-xl text-xs text-white placeholder-gray-500 outline-none transition-all font-mono tracking-widest text-center"
                    />
                  </div>
                  <p className="text-[10px] text-gray-500 font-mono">For quick 1-click mobile login</p>
                </div>
              )}
            </div>

            {/* Trial Feature Highlights */}
            {!isLoginMode && (
              <div className="p-3 rounded-xl bg-white/[0.02] border border-white/5 space-y-1.5 text-[11px] font-mono text-gray-300">
                <div className="flex items-center gap-2 text-emerald-400">
                  <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                  <span>No credit card required for 7-Day trial</span>
                </div>
                <div className="flex items-center gap-2 text-gray-400 text-[10px]">
                  <Zap className="w-3 h-3 text-cyan-400 shrink-0" />
                  <span>Includes Nifty 500 scanner + APEX AI Signal Labs</span>
                </div>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 rounded-xl font-bold text-sm text-white flex items-center justify-center gap-2 shadow-xl cursor-pointer transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                background: 'linear-gradient(135deg, #6366F1, #4F46E5)',
                boxShadow: '0 10px 25px -5px rgba(99, 102, 241, 0.4)',
              }}
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Creating Your Account...</span>
                </>
              ) : isLoginMode ? (
                <>
                  <span>Log In to Terminal</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              ) : (
                <>
                  <span>🚀 Start 7-Day Free Trial</span>
                </>
              )}
            </button>

            {/* Footer Link */}
            <div className="pt-2 text-center text-xs font-sans text-gray-400 border-t border-white/5">
              {isLoginMode ? (
                <span>
                  Don't have an account?{' '}
                  <button
                    type="button"
                    onClick={() => {
                      setIsLoginMode(false);
                      setError(null);
                    }}
                    className="text-cyan-400 font-bold hover:underline cursor-pointer"
                  >
                    Start 7-Day Free Trial
                  </button>
                </span>
              ) : (
                <span>
                  Already have an account?{' '}
                  <button
                    type="button"
                    onClick={() => {
                      if (onSwitchToLogin) {
                        onSwitchToLogin();
                      } else {
                        setIsLoginMode(true);
                        setError(null);
                      }
                    }}
                    className="text-indigo-400 font-bold hover:underline cursor-pointer"
                  >
                    Log In
                  </button>
                </span>
              )}
            </div>
          </form>
        )}
      </div>

      {/* Footer Branding Subtext */}
      <div className="mt-6 text-center text-[11px] font-mono text-gray-500 z-10 flex items-center gap-2">
        <Sparkles className="w-3 h-3 text-cyan-400" />
        <span>APEX Intelligence Quantitative Research Desk · Institutional Grade</span>
      </div>
    </div>
  );
};
