import React from 'react';

export type LogoVariant = 'apex-delta' | 'apex-hex' | 'apex-wave';

interface ApexLogoProps {
  className?: string;
  size?: number;
  variant?: LogoVariant;
}

export const ApexLogo: React.FC<ApexLogoProps> = ({ 
  className = 'w-6 h-6', 
  size,
  variant = 'apex-delta' 
}) => {
  const pixelSize = size ? { width: size, height: size } : undefined;

  if (variant === 'apex-hex') {
    return (
      <svg
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={className}
        style={pixelSize}
      >
        <defs>
          <linearGradient id="hexGrad" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#22D3EE" />
            <stop offset="50%" stopColor="#3B82F6" />
            <stop offset="100%" stopColor="#6366F1" />
          </linearGradient>
          <linearGradient id="emeraldBreak" x1="16" y1="20" x2="26" y2="6" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#10B981" />
            <stop offset="100%" stopColor="#34D399" />
          </linearGradient>
        </defs>
        {/* Hex Shield Border */}
        <path
          d="M16 2L28 8.9282V23.0718L16 30L4 23.0718V8.9282L16 2Z"
          stroke="url(#hexGrad)"
          strokeWidth="2"
          strokeLinejoin="round"
          fill="#0D1117"
        />
        {/* Inner Apex A Delta */}
        <path
          d="M16 7L23 23H19.5L16 15L12.5 23H9L16 7Z"
          fill="url(#hexGrad)"
        />
        {/* Ascending Trend Candle */}
        <path
          d="M16 11L25 5M25 5H20M25 5V10"
          stroke="url(#emeraldBreak)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="25" cy="5" r="2" fill="#34D399" />
      </svg>
    );
  }

  if (variant === 'apex-wave') {
    return (
      <svg
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={className}
        style={pixelSize}
      >
        <defs>
          <linearGradient id="waveGrad" x1="2" y1="30" x2="30" y2="2" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#06B6D4" />
            <stop offset="50%" stopColor="#6366F1" />
            <stop offset="100%" stopColor="#EC4899" />
          </linearGradient>
        </defs>
        {/* Dynamic Wave Delta */}
        <path
          d="M4 25C8 25 10 18 14 12C17 7.5 20 4 25 4C28 4 28 8 25 12C20 18.5 16 25 10 25C7 25 5 22 7 18C10 12 16 4 22 4"
          stroke="url(#waveGrad)"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
        <circle cx="25" cy="4" r="2.5" fill="#22D3EE" />
      </svg>
    );
  }

  // Default: 'apex-delta' - The Pinnacle Quantitative Intelligence Logo
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={pixelSize}
    >
      <defs>
        {/* Apex Primary Electric Gradient (Cyan -> Royal Blue -> Violet) */}
        <linearGradient id="apexPrimaryGrad" x1="4" y1="28" x2="28" y2="2" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#06B6D4" />
          <stop offset="45%" stopColor="#3B82F6" />
          <stop offset="100%" stopColor="#6366F1" />
        </linearGradient>

        {/* Bullish Institutional Growth Gradient (Emerald -> Bright Mint) */}
        <linearGradient id="apexGreenGrowth" x1="12" y1="24" x2="27" y2="5" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#059669" />
          <stop offset="100%" stopColor="#10B981" />
        </linearGradient>

        {/* Subtle AI Pulse Glow */}
        <filter id="apexGlowFilter" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="1.2" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
      </defs>

      {/* 1. Base Delta Structure / "A" Wing Left */}
      <path
        d="M5 26.5L16 4.5L19.5 4.5L11.5 26.5H5Z"
        fill="url(#apexPrimaryGrad)"
      />

      {/* 2. Interlocking "A" Wing Right (Translucent Overlay) */}
      <path
        d="M27 26.5L16 4.5L12.5 4.5L20.5 26.5H27Z"
        fill="url(#apexPrimaryGrad)"
        opacity="0.8"
      />

      {/* 3. Ascending Market Candlesticks (3 Quant Data Bars inside the Apex) */}
      {/* Bar 1: Short Foundation */}
      <rect x="10" y="19.5" width="2.2" height="5.5" rx="1" fill="#38BDF8" opacity="0.85" />

      {/* Bar 2: Mid Signal */}
      <rect x="14.8" y="15" width="2.2" height="10" rx="1" fill="#818CF8" />

      {/* Bar 3: Bullish Breakout Apex Signal */}
      <rect x="19.6" y="9.5" width="2.4" height="15.5" rx="1.2" fill="url(#apexGreenGrowth)" filter="url(#apexGlowFilter)" />

      {/* 4. Bullish Vector Arrow Outbreak (Market Direction) */}
      <path
        d="M21 9.5L27.5 3M27.5 3H22.5M27.5 3V8"
        stroke="#10B981"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        filter="url(#apexGlowFilter)"
      />

      {/* 5. AI Intelligence Sparkle Core at top of the Apex */}
      <path
        d="M16 1.5C16 3.2 14.8 4.5 13 4.5C14.8 4.5 16 5.8 16 7.5C16 5.8 17.2 4.5 19 4.5C17.2 4.5 16 3.2 16 1.5Z"
        fill="#38BDF8"
        filter="url(#apexGlowFilter)"
      />
      <circle cx="16" cy="4.5" r="1.1" fill="#FFFFFF" />
    </svg>
  );
};


