import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { ArrowLeft, Download, Film, Music2, Play, RotateCcw, Send, SlidersHorizontal, Sparkles, Type, Upload, WandSparkles, X } from 'lucide-react'
import { Button, Badge } from './Primitives'

type Template = { id: string; name: string; detail: string; colors: string }
const templates: Template[] = [
  { id: 'cinematic', name: 'Cinematic', detail: 'Warm, dramatic', colors: 'linear-gradient(135deg,#171d2a,#78452f)' },
  { id: 'vivid', name: 'Vivid pop', detail: 'Bright, colorful', colors: 'linear-gradient(135deg,#a63277,#5546c7)' },
  { id: 'mono', name: 'Monochrome', detail: 'Quiet contrast', colors: 'linear-gradient(135deg,#161a22,#778296)' },
  { id: 'dream', name: 'Dream state', detail: 'Soft, pastel', colors: 'linear-gradient(135deg,#267baf,#a985d4)' },
]

export function StudioWorkspace({ onBack, onToast, onSubmitReview }: { onBack: () => void; onToast: (message: string) => void; onSubmitReview: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [videoUrl, setVideoUrl] = useState('')
  const [sourceFile, setSourceFile] = useState<File | null>(null)
  const [audioUrl, setAudioUrl] = useState('')
  const [fileName, setFileName] = useState('No video uploaded yet')
  const [audioName, setAudioName] = useState('No music selected')
  const [template, setTemplate] = useState('cinematic')
  const [brightness, setBrightness] = useState(100)
  const [contrast, setContrast] = useState(100)
  const [saturation, setSaturation] = useState(100)
  const [blur, setBlur] = useState(0)
  const [overlay, setOverlay] = useState('')
  const [overlayColor, setOverlayColor] = useState('#ffffff')
  const [start, setStart] = useState(0)
  const [end, setEnd] = useState(20)
  const [duration, setDuration] = useState(0)
  const [status, setStatus] = useState('Ready — upload a video to begin.')
  const [playing, setPlaying] = useState(false)
  const [reviewSubmitted, setReviewSubmitted] = useState(false)
  const [aspect, setAspect] = useState('9:16')
  const [exportUrl, setExportUrl] = useState('')
  const [exportFileName, setExportFileName] = useState('')

  useEffect(() => () => { if (videoUrl) URL.revokeObjectURL(videoUrl); if (audioUrl) URL.revokeObjectURL(audioUrl); if (exportUrl) URL.revokeObjectURL(exportUrl) }, [videoUrl, audioUrl, exportUrl])
  const filter = `${template === 'mono' ? ' grayscale(1)' : template === 'cinematic' ? ' sepia(.18)' : template === 'vivid' ? ' saturate(1.45)' : ' saturate(1.15)'} brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%) blur(${blur}px)`
  const uploadVideo = (event: ChangeEvent<HTMLInputElement>) => { const file = event.target.files?.[0]; if (!file) return; if (!file.type.startsWith('video/')) { setStatus('Please choose a video file.'); return } if (videoUrl) URL.revokeObjectURL(videoUrl); const url = URL.createObjectURL(file); setSourceFile(file); setVideoUrl(url); setFileName(`${file.name} · ${(file.size / 1024 / 1024).toFixed(1)} MB`); setStatus('Video loaded. Choose a template or adjust effects.') }
  const uploadAudio = (event: ChangeEvent<HTMLInputElement>) => { const file = event.target.files?.[0]; if (!file) return; if (audioUrl) URL.revokeObjectURL(audioUrl); setAudioUrl(URL.createObjectURL(file)); setAudioName(`${file.name} · ${(file.size / 1024 / 1024).toFixed(1)} MB`); setStatus('Music loaded. Use the audio controls to preview it.') }
  const handleMetadata = () => { const value = videoRef.current?.duration ?? 0; setDuration(value); setEnd(Number(value.toFixed(1))); setStatus(`Video ready — ${value.toFixed(1)} seconds available.`) }
  const applyTrim = () => { if (!videoUrl) return setStatus('Upload a video first.'); if (start < 0 || end <= start || (duration && end > duration)) return setStatus('Choose a valid range within the video duration.'); if (videoRef.current) videoRef.current.currentTime = start; setStatus(`Trim range set: ${start.toFixed(1)}s – ${end.toFixed(1)}s.`) }
  const previewTrim = () => { if (!videoUrl) return setStatus('Upload a video first.'); if (videoRef.current) { videoRef.current.currentTime = start; void videoRef.current.play(); setPlaying(true) } }
  const resetEffects = () => { setBrightness(100); setContrast(100); setSaturation(100); setBlur(0); setTemplate('cinematic'); setStatus('Effects reset.') }
  const triggerDownload = (url: string, name: string, revoke = false) => { const link = document.createElement('a'); link.href = url; link.download = name; link.style.display = 'none'; document.body.appendChild(link); link.click(); link.remove(); if (revoke) window.setTimeout(() => URL.revokeObjectURL(url), 1500) }
  const downloadSourceFallback = (reason: string) => { if (!sourceFile) return setStatus(reason); const extension = sourceFile.name.split('.').pop() || 'mp4'; const url = URL.createObjectURL(sourceFile); triggerDownload(url, `creatormatch-ai-source-${Date.now()}.${extension}`, true); setStatus(`${reason} The original video was downloaded instead.`); onToast('Original video downloaded') }
  const exportVideo = async () => {
    if (!videoUrl || !sourceFile) return setStatus('Upload a video before exporting.')
    setExportUrl(''); setExportFileName('')
    const video = videoRef.current
    if (!video || typeof MediaRecorder === 'undefined' || typeof HTMLCanvasElement.prototype.captureStream !== 'function') return downloadSourceFallback('This browser cannot render an edited video here.')
    const [width, height] = aspect === '16:9' ? [1280, 720] : aspect === '1:1' ? [900, 900] : [720, 1280]
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height
    const context = canvas.getContext('2d'); if (!context) return setStatus('Could not prepare the export canvas.')
    let stream: MediaStream; let recorder: MediaRecorder
    try {
      stream = canvas.captureStream(30)
      const mimeType = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find((type) => MediaRecorder.isTypeSupported(type))
      if (!mimeType) return downloadSourceFallback('This browser does not support WebM export.')
      recorder = new MediaRecorder(stream, { mimeType })
    } catch { return downloadSourceFallback('The browser could not start the video exporter.') }
    const mimeType = recorder.mimeType || 'video/webm'
    const chunks: BlobPart[] = []
    recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data) }
    setStatus('Rendering a real video export…')
    const originalTime = video.currentTime
    const originalMuted = video.muted
    const wasPlaying = !video.paused
    video.currentTime = Math.max(0, start)
    video.muted = true
    try { await video.play() } catch { video.muted = originalMuted; return downloadSourceFallback('The preview could not be rendered in this browser.') }
    recorder.start(100)
    const renderStartedAt = performance.now(); const maxRenderMs = Math.max(1000, ((duration ? Math.min(end, duration) : end) - start) * 1000 + 1500); let stopped = false
    const stopRecorder = () => { if (!stopped) { stopped = true; recorder.stop() } }
    const drawFrame = () => {
      if (video.ended || video.currentTime >= end || performance.now() - renderStartedAt >= maxRenderMs) { stopRecorder(); return }
      if (video.paused || video.readyState < 2) { requestAnimationFrame(drawFrame); return }
      context.fillStyle = '#10141c'; context.fillRect(0, 0, width, height)
      context.save(); context.filter = filter
      const sourceRatio = video.videoWidth / Math.max(video.videoHeight, 1); const targetRatio = width / height
      let drawWidth = width; let drawHeight = height
      if (sourceRatio > targetRatio) drawWidth = height * sourceRatio; else drawHeight = width / sourceRatio
      context.drawImage(video, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight); context.restore()
      if (overlay.trim()) { context.fillStyle = overlayColor; context.font = `700 ${Math.max(24, Math.round(width / 22))}px system-ui`; context.textAlign = 'center'; context.shadowColor = '#0008'; context.shadowBlur = 12; context.fillText(overlay.trim(), width / 2, height - Math.max(48, height / 9)) }
      requestAnimationFrame(drawFrame)
    }
    recorder.onstop = () => {
      video.pause(); video.currentTime = originalTime; video.muted = originalMuted; if (wasPlaying) void video.play()
      const blob = new Blob(chunks, { type: mimeType }); const url = URL.createObjectURL(blob); const name = `creatormatch-ai-${Date.now()}.webm`
      setExportUrl(url); setExportFileName(name)
      triggerDownload(url, name)
      setStatus(`Export ready — ${Math.round(blob.size / 1024)} KB WebM. Use Download export if the browser blocked the automatic download.`); onToast('Export ready — click Download export to download it')
    }
    drawFrame()
  }
  const submitReview = () => { if (!videoUrl) return setStatus('Upload a video before submitting for review.'); setReviewSubmitted(true); setStatus('Submitted for admin review.'); onSubmitReview() }
  const time = (value: number) => `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(Math.floor(value % 60)).padStart(2, '0')}`

  return <div className="reference-studio">
    <header className="reference-header"><button className="back-link" onClick={onBack}><ArrowLeft size={16} /> Back to assignment</button><div className="reference-brand">CreatorMatch <span>STUDIO</span></div><div className="reference-actions"><Badge tone="green">Local draft</Badge><Button tone="quiet" onClick={resetEffects}><RotateCcw size={14} /> Reset effects</Button><Button onClick={exportVideo}><Download size={15} /> Export video</Button></div></header>
    <main className="reference-main">
      <aside className="reference-panel media-panel"><div className="reference-title"><h2><Film size={16} /> Media & templates</h2><span className="muted">{aspect}</span></div><label>Canvas ratio<select value={aspect} onChange={(event) => setAspect(event.target.value)}><option value="9:16">Portrait 9:16</option><option value="16:9">Landscape 16:9</option><option value="1:1">Square 1:1</option></select></label><label className="reference-upload"><Upload size={20} /><b>Upload a video</b><small>MP4, WebM or MOV</small><input type="file" accept="video/*" onChange={uploadVideo} /></label><p className="muted">Choose a starting look, then tune the frame in the inspector.</p><h3>QUICK TEMPLATES</h3><div className="reference-template-grid">{templates.map((item) => <button key={item.id} className={`reference-template ${template === item.id ? 'active' : ''}`} onClick={() => { setTemplate(item.id); setStatus(`Applied ${item.name} template to preview.`) }}><span style={{ background: item.colors }}>{item.id === 'mono' ? 'MONO' : item.id.toUpperCase()}</span><strong>{item.name}</strong><small>{item.detail}</small></button>)}</div><h3>PROJECT</h3><div className="muted reference-file">{fileName}</div><p className="reference-note">Tip: use a short MP4 clip for a faster browser preview.</p></aside>
      <section className="reference-workspace"><div className={`reference-preview aspect-${aspect.replace(':', '-')}`}><span className="reference-preview-label">PREVIEW · {aspect}</span>{videoUrl ? <video ref={videoRef} src={videoUrl} controls playsInline onLoadedMetadata={handleMetadata} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onTimeUpdate={(event) => { if (event.currentTarget.currentTime >= end && !event.currentTarget.paused) event.currentTarget.pause() }} style={{ filter }} /> : <div className="reference-empty"><Sparkles size={34} /><strong>Your preview goes here</strong><p>Upload a video to start editing.</p></div>}{overlay && <div className="reference-overlay" style={{ color: overlayColor }}>{overlay}<button onClick={() => setOverlay('')} aria-label="Remove text overlay"><X size={13} /></button></div>}</div><div className="reference-control-panel"><div className="reference-heading"><h2><SlidersHorizontal size={15} /> Clip controls</h2><span className="reference-value">{time(duration ? (videoRef.current?.currentTime ?? 0) : 0)} / {time(duration)}</span></div><div className="reference-controls"><label>Start time (seconds)<input type="number" min="0" step="0.1" value={start} onChange={(event) => setStart(Number(event.target.value))} /></label><label>End time (seconds)<input type="number" min="0" step="0.1" value={end} onChange={(event) => setEnd(Number(event.target.value))} /></label></div><div className="reference-actions-row"><Button tone="quiet" onClick={previewTrim}><Play size={14} /> Preview from start</Button><Button onClick={applyTrim}>Set trim range</Button></div><div className="reference-timeline"><div className="reference-heading"><b>Timeline</b><span className="reference-value">{time(start)} – {time(end)}</span></div><div className="reference-track"><i style={{ left: `${duration ? start / duration * 100 : 0}%`, width: `${duration ? Math.max(8, (end - start) / duration * 100) : 30}%` }} /></div><small>Visual timeline preview — trim range is applied to the review export.</small></div></div></section>
      <aside className="reference-panel inspector-panel"><section><h2><WandSparkles size={16} /> Effects</h2><Range label="Brightness" value={brightness} min={40} max={180} onChange={setBrightness} suffix="%" /><Range label="Contrast" value={contrast} min={40} max={180} onChange={setContrast} suffix="%" /><Range label="Saturation" value={saturation} min={0} max={200} onChange={setSaturation} suffix="%" /><Range label="Soft blur" value={blur} min={0} max={5} onChange={setBlur} suffix="px" /></section><section><h2><Type size={16} /> Text overlay</h2><label>Text on video<input value={overlay} onChange={(event) => setOverlay(event.target.value)} placeholder="Type your title…" /></label><label>Text color<select value={overlayColor} onChange={(event) => setOverlayColor(event.target.value)}><option value="#ffffff">White</option><option value="#facc15">Yellow</option><option value="#fb7185">Pink</option><option value="#67e8f9">Cyan</option></select></label><Button tone="quiet" onClick={() => overlay.trim() ? setStatus('Text overlay added to preview.') : setStatus('Type some text first.')} >Show text overlay</Button></section><section><h2><Music2 size={16} /> Audio</h2><label className="reference-file-input">Upload background music<input type="file" accept="audio/*" onChange={uploadAudio} /></label><div className="muted reference-file">{audioName}</div>{audioUrl && <audio src={audioUrl} controls />}</section></aside>
    </main><div className="reference-footer"><span role="status">{status}</span><div className="reference-actions-row">{videoUrl && sourceFile && <a className="button button-outline" href={videoUrl} download={sourceFile.name}><Download size={15} /> Download video</a>}{exportUrl && <a className="button button-primary" href={exportUrl} download={exportFileName}><Download size={15} /> Download export</a>}<Button onClick={submitReview} disabled={!videoUrl || reviewSubmitted}><Send size={15} /> {reviewSubmitted ? 'Submitted for review' : 'Submit for review'}</Button></div></div>
  </div>
}
function Range({ label, value, min, max, suffix, onChange }: { label: string; value: number; min: number; max: number; suffix: string; onChange: (value: number) => void }) { return <label className="reference-range"><span><b>{label}</b><em>{value}{suffix}</em></span><input type="range" min={min} max={max} value={value} onChange={(event) => onChange(Number(event.target.value))} /></label> }
