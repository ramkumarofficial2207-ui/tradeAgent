import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import DashboardPage from './pages/DashboardPage'
import ScreenerPage from './pages/ScreenerPage'
import BacktestPage from './pages/BacktestPage'
import './App.css'

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/screener" element={<ScreenerPage />} />
        <Route path="/backtest" element={<BacktestPage />} />
      </Routes>
    </Router>
  )
}
