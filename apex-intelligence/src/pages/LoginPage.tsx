import React, { useState, useRef } from 'react';
import {
  Lock,
  Mail,
  Phone,
  KeyRound,
  Eye,
  EyeOff,
  ArrowRight,
  Loader2,
  Sparkles,
  ShieldCheck,
  Zap,
  X,
  CheckCircle2,
} from 'lucide-react';
import { User } from '../types';
import { ApexLogo } from '../components/ApexLogo';
import { apiJson } from '../lib/api';
import { isValidMobileNumber, normalizeMobileNumberInput } from '../lib/loginForm';

interface LoginPageProps {
  onSuccessLogin?: (user: User) => void;
  onSwitchToRegister?: () => void;
  onClose?: () => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({
  onSuccessLogin,
  onSwitchToRegister,
  onClose,
}) => {
  // Mode state: 'password' | 'mpin'
  const [loginMode, setLoginMode] = useState<'password' | 'mpin'>('password');

  // Form states
  const [passwordIdentifier, setPasswordIdentifier] = useState<string>('');
  const [mpinMobileNumber, setMpinMobileNumber] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);

  // MPIN state: array of 6 strings
  const [mpinDigits, setMpinDigits] = useState<string[]>(['', '', '', '', '', '']);
  const pinInputRefs = [
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
  ];

  // UI status
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Handle digit change for 6-digit MPIN
  const handlePinChange = (index: number, value: string) => {
    const digit = value.replace(/\D/g, '').slice(-1);
    const newDigits = [...mpinDigits];
    newDigits[index] = digit;
    setMpinDigits(newDigits);

    // Auto-focus next box if digit is entered
    if (digit && index < 5) {
      pinInputRefs[index + 1].current?.focus();
    }
  };

  // Handle backspace in 6-digit MPIN
  const handlePinKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !mpinDigits[index] && index > 0) {
      pinInputRefs[index - 1].current?.focus();
    }
  };

  // Handle paste in MPIN
  const handlePinPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!pasted) return;

    const newDigits = ['', '', '', '', '', ''];
    for (let i = 0; i < pasted.length; i++) {
      newDigits[i] = pasted[i];
    }
    setMpinDigits(newDigits);

    const nextFocusIndex = Math.min(pasted.length, 5);
    pinInputRefs[nextFocusIndex].current?.focus();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);

    let payload: Record<string, any> = {};

    if (loginMode === 'password') {
      const identifier = passwordIdentifier.trim();
      if (!identifier) {
        setError('Please enter your email or mobile number.');
        return;
      }
      if (!password) {
        setError('Please enter your password.');
        return;
      }

      if (identifier.includes('@')) {
        payload.email = identifier;
      } else {
        payload.mobileNumber = identifier;
      }
      payload.password = password;
    } else {
      // MPIN mode
      const mpinString = mpinDigits.join('');
      if (!isValidMobileNumber(mpinMobileNumber)) {
        setError('Please enter a valid mobile number (10 to 15 digits).');
        return;
      }
      if (mpinString.length !== 6) {
        setError('Please enter all 6 digits of your MPIN.');
        return;
      }

      payload.mobileNumber = mpinMobileNumber;
      payload.mpin = mpinString;
    }

    setLoading(true);

    try {
      const data = await apiJson<any>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      // Save returned JWT token to localStorage
      if (data.token) {
        localStorage.setItem('token', data.token);
      }

      setSuccessMessage(data.message || 'Login successful!');

      setTimeout(() => {
        if (data.user && onSuccessLogin) {
          onSuccessLogin(data.user);
        } else if (onClose) {
          onClose();
        } else {
          window.location.reload();
        }
      }, 600);
    } catch (err: any) {
      setError(err.message || 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0D14] flex flex-col items-center justify-center p-4 sm:p-6 relative overflow-hidden select-none font-sans">
      {/* Background Ambient Glows */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-indigo-600/15 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-10 right-10 w-[350px] h-[350px] bg-cyan-500/10 blur-[100px] rounded-full pointer-events-none" />

      {/* Top Header Logo & Close */}
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

      {/* Form Card */}
      <div
        className="w-full max-w-[460px] z-10 p-6 sm:p-8 rounded-[20px] border border-white/10 shadow-2xl relative overflow-hidden transition-all duration-300"
        style={{
          background: 'rgba(16, 20, 30, 0.85)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
        }}
      >
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Header Title & Subtext */}
          <div className="space-y-1.5 text-left">
            <h2 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight font-sans">
              Welcome Back to APEX Intelligence
            </h2>
            <p className="text-xs text-gray-400 font-sans leading-relaxed">
              Access quantitative signal labs and institutional smart money feeds
            </p>
          </div>

          {/* Login Mode Toggle Pills */}
          <div className="grid grid-cols-2 gap-1.5 p-1 bg-[#080B10] border border-white/10 rounded-xl text-xs font-semibold">
            <button
              type="button"
              onClick={() => {
                setLoginMode('password');
                setError(null);
              }}
              className={`py-2 px-3 rounded-lg flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                loginMode === 'password'
                  ? 'bg-[#6366F1] text-white shadow-md shadow-indigo-500/25 font-bold'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              <span>🔑 Password Login</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setLoginMode('mpin');
                setError(null);
              }}
              className={`py-2 px-3 rounded-lg flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                loginMode === 'mpin'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-bold shadow-md shadow-cyan-500/10'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              <span>⚡ Quick 6-Digit MPIN</span>
            </button>
          </div>

          {/* Error Alert */}
          {error && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-mono flex items-start gap-2 animate-in fade-in duration-200">
              <span className="font-bold">⚠️</span>
              <span className="flex-1">{error}</span>
            </div>
          )}

          {/* Success Alert */}
          {successMessage && (
            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-mono flex items-center gap-2 animate-in fade-in duration-200">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* Mode 1: Password Login */}
          {loginMode === 'password' && (
            <div className="space-y-3 animate-in fade-in duration-200">
              {/* Email / Mobile Input */}
              <div className="space-y-1">
                <label className="text-[11px] font-mono text-gray-300 font-medium flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-indigo-400" /> Email or Mobile Number
                </label>
                <input
                  type="text"
                  name="username"
                  autoComplete="username"
                  required
                  placeholder="name@company.com or +91 98765 43210"
                  value={passwordIdentifier}
                  onChange={(e) => setPasswordIdentifier(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-[#080B10] border border-white/10 focus:border-indigo-500/80 rounded-xl text-xs text-white placeholder-gray-500 outline-none transition-all font-sans"
                />
              </div>

              {/* Password Input */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-mono text-gray-300 font-medium flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5 text-indigo-400" /> Password
                  </label>
                  <a
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      alert('Reset link sent to registered email.');
                    }}
                    className="text-[10px] font-mono text-indigo-400 hover:underline"
                  >
                    Forgot Password?
                  </a>
                </div>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    name="password"
                    autoComplete="current-password"
                    required
                    placeholder="Enter your password"
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
            </div>
          )}

          {/* Mode 2: Quick 6-Digit MPIN Login */}
          {loginMode === 'mpin' && (
            <div className="space-y-4 animate-in fade-in duration-200">
              {/* Mobile Input */}
              <div className="space-y-1">
                <label className="text-[11px] font-mono text-gray-300 font-medium flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5 text-cyan-400" /> Mobile Number
                </label>
                <input
                  type="tel"
                  name="mobileNumber"
                  autoComplete="tel"
                  inputMode="tel"
                  required
                  minLength={10}
                  maxLength={16}
                  pattern="\+?[0-9]{10,15}"
                  placeholder="+91 98765 43210"
                  value={mpinMobileNumber}
                  onChange={(e) => setMpinMobileNumber(normalizeMobileNumberInput(e.target.value))}
                  className="w-full px-3.5 py-2.5 bg-[#080B10] border border-white/10 focus:border-cyan-500/80 rounded-xl text-xs text-white placeholder-gray-500 outline-none transition-all font-mono"
                />
              </div>

              {/* 6 Square MPIN Boxes */}
              <div className="space-y-2">
                <label className="text-[11px] font-mono text-cyan-300 font-medium flex items-center gap-1.5 justify-center">
                  <KeyRound className="w-3.5 h-3.5 text-cyan-400" /> Enter 6-Digit Quick MPIN
                </label>
                <div className="flex items-center justify-center gap-3">
                  {mpinDigits.map((digit, idx) => (
                    <input
                      key={idx}
                      ref={pinInputRefs[idx]}
                      type="password"
                      inputMode="numeric"
                      autoComplete="off"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => handlePinChange(idx, e.target.value)}
                      onKeyDown={(e) => handlePinKeyDown(idx, e)}
                      onPaste={handlePinPaste}
                      className="w-12 h-13 text-center text-lg font-bold font-mono text-white bg-[#080B10] border border-white/15 focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400/50 rounded-xl outline-none transition-all shadow-inner"
                    />
                  ))}
                </div>
                <p className="text-[10px] text-gray-500 font-mono text-center">
                  Instant 1-click mobile verification
                </p>
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
                <span>Authenticating...</span>
              </>
            ) : (
              <>
                <span>Sign In to Dashboard</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>

          {/* Footer Link */}
          <div className="pt-2 text-center text-xs font-sans text-gray-400 border-t border-white/5">
            <span>
              New to APEX Intelligence?{' '}
              <button
                type="button"
                onClick={() => {
                  if (onSwitchToRegister) {
                    onSwitchToRegister();
                  } else {
                    window.location.hash = '#register';
                  }
                }}
                className="text-emerald-400 font-bold hover:underline cursor-pointer"
              >
                Start 7-Day Free Trial
              </button>
            </span>
          </div>
        </form>
      </div>

      {/* Footer Branding */}
      <div className="mt-6 text-center text-[11px] font-mono text-gray-500 z-10 flex items-center gap-2">
        <Sparkles className="w-3 h-3 text-cyan-400" />
        <span>APEX Intelligence Quantitative Research Desk · Institutional Grade</span>
      </div>
    </div>
  );
};
