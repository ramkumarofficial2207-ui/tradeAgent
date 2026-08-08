import React from 'react';
import { TechnicalChartPanel } from './TechnicalChartPanel';

interface TradingViewWidgetProps {
  ticker: string;
  height?: number | string;
}

export const TradingViewWidget: React.FC<TradingViewWidgetProps> = ({
  ticker,
}) => {
  return <TechnicalChartPanel ticker={ticker} />;
};


