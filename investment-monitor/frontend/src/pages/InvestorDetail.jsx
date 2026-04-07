import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import api from '../lib/api'
import { TrendingUp, Twitter, FileText } from 'lucide-react'

export default function InvestorDetail() {
  const { id } = useParams()
  const [investor, setInvestor] = useState(null)
  const [posts, setPosts] = useState([])
  const [mentions, setMentions] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true)
        const [invRes, postsRes, mentRes] = await Promise.all([
          api.get(`/investors/${id}`),
          api.get(`/posts/investor/${id}`, { params: { limit: 20 } }),
          api.get(`/mentions/investor/${id}`),
        ])
        setInvestor(invRes.data)
        setPosts(postsRes.data)
        setMentions(mentRes.data)
      } catch (error) {
        console.error('Error fetching investor:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [id])

  if (loading) return <div className="p-6">Loading...</div>
  if (!investor) return <div className="p-6">Investor not found</div>

  const topTickers = mentions
    .reduce((acc, m) => {
      const existing = acc.find(t => t.ticker === m.ticker)
      if (existing) {
        existing.count++
        if (m.sentiment === 'positive') existing.bullish++
        else if (m.sentiment === 'negative') existing.bearish++
      } else {
        acc.push({
          ticker: m.ticker,
          count: 1,
          bullish: m.sentiment === 'positive' ? 1 : 0,
          bearish: m.sentiment === 'negative' ? 1 : 0,
        })
      }
      return acc
    }, [])
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold mb-2">{investor.name}</h1>
            <p className="text-gray-400 max-w-2xl">{investor.bio}</p>
            <div className="flex gap-4 mt-4 text-sm">
              {investor.handle_x && (
                <a href={`https://twitter.com/${investor.handle_x}`} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-blue-400 hover:text-blue-300">
                  <Twitter className="w-4 h-4" /> @{investor.handle_x}
                </a>
              )}
              {investor.website_url && (
                <a href={investor.website_url} target="_blank" rel="noreferrer" className="text-blue-400 hover:text-blue-300">
                  {investor.website_url}
                </a>
              )}
            </div>
          </div>
          <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full" />
        </div>
      </div>

      {/* Top Tickers */}
      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
        <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-green-400" />
          Top Mentioned Tickers
        </h2>
        <div className="space-y-2">
          {topTickers.map(ticker => (
            <div key={ticker.ticker} className="bg-gray-700 p-3 rounded flex items-center justify-between">
              <div>
                <div className="font-bold">{ticker.ticker}</div>
                <div className="text-sm text-gray-400">{ticker.count} mentions</div>
              </div>
              <div className="flex gap-2 text-sm">
                <span className="text-green-400">+{ticker.bullish}</span>
                <span className="text-red-400">-{ticker.bearish}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Recent Posts */}
      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
        <h2 className="text-xl font-bold mb-4">Recent Posts ({posts.length})</h2>
        <div className="space-y-3 max-h-96 overflow-y-auto">
          {posts.map(post => (
            <div key={post.id} className="bg-gray-700 p-4 rounded-lg">
              <div className="flex items-start justify-between mb-2">
                <div className="text-xs text-gray-400 uppercase font-bold">{post.source}</div>
                <div className="text-xs text-gray-400">{new Date(post.posted_at).toLocaleString()}</div>
              </div>
              <p className="text-sm text-gray-200 mb-3 line-clamp-3">{post.content}</p>
              {post.mentions && post.mentions.length > 0 && (
                <div className="flex gap-2 flex-wrap">
                  {post.mentions.map((m, i) => (
                    <span key={i} className="bg-blue-900 px-2 py-1 rounded text-xs font-bold">
                      ${m.ticker}
                    </span>
                  ))}
                </div>
              )}
              <div className="flex gap-4 mt-3 text-xs text-gray-400">
                <span>❤️ {post.engagement_likes}</span>
                <span>💬 {post.engagement_comments}</span>
                <span>🔄 {post.engagement_shares}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
