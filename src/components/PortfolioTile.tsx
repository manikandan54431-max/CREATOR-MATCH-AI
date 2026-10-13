import { ArrowUpRight, Play } from 'lucide-react'

export function PortfolioTile({ item, featured = false }: { item: { label: string; title: string; meta: string; tone: string; mark: string }; featured?: boolean }) {
  return <article className={`portfolio-tile ${featured ? 'portfolio-tile-featured' : ''}`}>
    <div className="portfolio-art" style={{ background: item.tone }}>
      <span className="art-grid" />
      <span className="art-mark">{item.mark}</span>
      <span className="art-caption">CREATORMATCH / {item.label.toUpperCase()}</span>
      {item.label === 'Reel' && <span className="play-chip"><Play size={12} fill="currentColor" /></span>}
    </div>
    <div className="portfolio-meta"><div><span className="eyebrow">{item.label}</span><h3>{item.title}</h3></div><ArrowUpRight size={17} /></div>
    <p>{item.meta}</p>
  </article>
}
