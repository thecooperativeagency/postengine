import { create } from 'zustand'
import api from '../lib/api'

export const useStore = create((set) => ({
  // State
  stats: {},
  investors: [],
  alerts: [],
  trendingTickers: [],
  activityFeed: [],
  loading: false,
  error: null,

  // Actions
  fetchStats: async () => {
    try {
      const res = await api.get('/dashboard/stats')
      set({ stats: res.data })
    } catch (err) {
      console.error('Error fetching stats:', err)
    }
  },

  fetchInvestors: async () => {
    try {
      set({ loading: true })
      const res = await api.get('/investors')
      set({ investors: res.data, loading: false })
    } catch (err) {
      set({ error: err.message, loading: false })
    }
  },

  fetchAlerts: async (limit = 50) => {
    try {
      const res = await api.get('/alerts', { params: { limit } })
      set({ alerts: res.data })
    } catch (err) {
      console.error('Error fetching alerts:', err)
    }
  },

  fetchTrendingTickers: async () => {
    try {
      const res = await api.get('/dashboard/trending')
      set({ trendingTickers: res.data })
    } catch (err) {
      console.error('Error fetching trending:', err)
    }
  },

  fetchActivityFeed: async (hours = 24) => {
    try {
      const res = await api.get('/dashboard/activity', { params: { hours } })
      set({ activityFeed: res.data })
    } catch (err) {
      console.error('Error fetching activity:', err)
    }
  },

  markAlertAsRead: async (alertId) => {
    try {
      await api.put(`/alerts/${alertId}/read`)
      set(state => ({
        alerts: state.alerts.map(a => 
          a.id === alertId ? { ...a, read_at: new Date() } : a
        )
      }))
    } catch (err) {
      console.error('Error marking alert as read:', err)
    }
  },

  addAlert: (alert) => {
    set(state => ({
      alerts: [alert, ...state.alerts]
    }))
  },

  clearError: () => set({ error: null }),
}))
