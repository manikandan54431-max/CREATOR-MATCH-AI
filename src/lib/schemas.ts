import { z } from 'zod'

export const profileSchema = z.object({
  display_name: z.string().trim().min(2).max(80),
  bio: z.string().trim().max(600).default(''),
  specialization: z.string().trim().max(100).default(''),
  skills: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  tools: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
})
export const briefSchema = z.object({
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().min(20).max(3000),
  target_audience: z.string().trim().max(300).default(''),
  deliverables: z.string().trim().min(3).max(1000),
  content_type: z.enum(['video', 'image', 'animation', 'graphics', 'social']),
  style_direction: z.string().trim().max(500).default(''),
  platform: z.string().trim().max(100).default(''),
  budget: z.coerce.number().min(0).max(10000000).nullable().optional(),
  deadline: z.string().optional(),
})
export const portfolioSchema = z.object({
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().max(1000).default(''),
  media_type: z.enum(['image', 'video', 'animation', 'graphics', 'social']),
  tool_used: z.string().trim().max(100).default(''),
  external_url: z.union([z.literal(''), z.string().url().max(500)]).default(''),
})