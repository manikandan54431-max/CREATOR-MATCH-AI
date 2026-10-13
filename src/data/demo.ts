export type Role = 'client' | 'creator' | 'admin'
export type ProjectStatus = 'New brief' | 'Assigned' | 'In production' | 'In review' | 'Delivered'

export type Project = {
  id: string
  title: string
  client: string
  service: string
  status: ProjectStatus
  due: string
  budget: string
  brief: string
  audience: string
  style?: string
  format: string
  commercialUse: boolean
  references?: string[]
  feedback?: string
  creator?: string
  color: string
}

export const demoProjects: Project[] = [
  {
    id: 'cm-1042',
    title: 'Afterglow — launch cut',
    client: 'Northline Objects',
    service: 'Reel',
    status: 'In production',
    due: '18 Oct 2026',
    budget: '$1,250',
    brief: 'A 20-second vertical launch film for a warm, tactile desk lamp. The story should feel like late light becoming a usable object.',
    audience: 'Design-conscious renters, 25–38',
    format: '9:16 · 1080 × 1920 · 20 sec',
    commercialUse: true,
    creator: 'Mara Kline',
    color: '#e6dfd4',
  },
  {
    id: 'cm-1041',
    title: 'Field Notes / issue 07',
    client: 'Juniper Studio',
    service: 'Editorial graphic',
    status: 'New brief',
    due: '24 Oct 2026',
    budget: '$740',
    brief: 'A social-first editorial system for a short report on the future of small-batch manufacturing.',
    audience: 'Independent makers and operators',
    format: 'Carousel · 6 frames · 4:5',
    commercialUse: true,
    color: '#d9e1eb',
  },
  {
    id: 'cm-1039',
    title: 'Quiet Signal / stills',
    client: 'Fieldwork Audio',
    service: 'Poster set',
    status: 'In review',
    due: '14 Oct 2026',
    budget: '$980',
    brief: 'Three music event posters that turn silence into a visual rhythm without relying on genre tropes.',
    audience: 'Independent music community',
    format: '3 posters · A2 + social crops',
    commercialUse: false,
    creator: 'Mara Kline',
    color: '#d8d4e7',
  },
]

export const demoCreators = [
  { name: 'Mara Kline', specialty: 'Motion + art direction', tools: 'Runway · Blender · Figma', availability: 'Available', initials: 'MK', tone: '#d9e1eb' },
  { name: 'Theo Park', specialty: 'Generative stills', tools: 'Midjourney · Photoshop · Krea', availability: 'In a project', initials: 'TP', tone: '#e5ded2' },
  { name: 'Aya Okafor', specialty: '3D + product worlds', tools: 'Cinema 4D · Spline · After Effects', availability: 'Available', initials: 'AO', tone: '#e0e7d5' },
]

export const demoMessages = [
  { id: 1, from: 'admin', name: 'Priya · Admin', text: 'I left one note on the opening frame. The rest of the direction is landing beautifully.', time: '09:42' },
  { id: 2, from: 'creator', name: 'Mara Kline', text: 'Got it. I will soften the first two seconds and resubmit the cut this afternoon.', time: '09:48' },
]

export const portfolioItems = [
  { label: 'Reel', title: 'Afterglow', meta: 'Motion study · 00:20', tone: '#d9e1eb', mark: 'A' },
  { label: 'Poster', title: 'Quiet Signal', meta: 'Campaign set · 03', tone: '#d8d4e7', mark: 'Q' },
  { label: 'Graphic', title: 'Soft Systems', meta: 'Editorial system · 06', tone: '#e0e7d5', mark: 'S' },
]
