import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import App from './App'
import Dashboard from './pages/Dashboard'
import InvestorDetail from './pages/InvestorDetail'
import TickerDetail from './pages/TickerDetail'
import Alerts from './pages/Alerts'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Router>
      <Routes>
        <Route path="/" element={<App />}>
          <Route index element={<Dashboard />} />
          <Route path="investors/:id" element={<InvestorDetail />} />
          <Route path="ticker/:ticker" element={<TickerDetail />} />
          <Route path="alerts" element={<Alerts />} />
        </Route>
      </Routes>
    </Router>
  </React.StrictMode>,
)
