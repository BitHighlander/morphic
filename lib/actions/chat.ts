'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { type Chat } from '@/lib/types'
import Redis from 'ioredis'

const redis = new Redis({
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: process.env.REDIS_PORT ? parseInt(process.env.REDIS_PORT, 10) : 6379,
  password: process.env.REDIS_PASSWORD || undefined,
  // Upstash uses a token-based authentication; if your local Redis setup does too, uncomment the following line
  // username: process.env.REDIS_USERNAME || undefined,
  // password: process.env.REDIS_PASSWORD || ''
});

export async function getChats(userId?: string | null) {
  if (!userId) {
    return []
  }

  try {
    const pipeline = redis.pipeline()
    const chats: string[] = await redis.zrevrange(`user:chat:${userId}`, 0, -1)

    for (const chat of chats) {
      pipeline.hgetall(chat)
    }

    const results = await pipeline.exec()
    return results.map(([err, result]) => result) as Chat[]
  } catch (error) {
    return []
  }
}

export async function getChat(id: string, userId: string = 'anonymous') {
  const chat = await redis.hgetall(`chat:${id}`)

  if (!Object.keys(chat).length) {
    return null
  }

  return chat as Chat
}

export async function clearChats(
    userId: string = 'anonymous'
): Promise<{ error?: string }> {
  const chats: string[] = await redis.zrange(`user:chat:${userId}`, 0, -1)
  if (!chats.length) {
    return { error: 'No chats to clear' }
  }
  const pipeline = redis.pipeline()

  for (const chat of chats) {
    pipeline.del(chat)
    pipeline.zrem(`user:chat:${userId}`, chat)
  }

  await pipeline.exec()

  revalidatePath('/')
  redirect('/')
}

export async function saveChat(chat: Chat, userId: string = 'anonymous') {
  const pipeline = redis.pipeline()
  pipeline.hmset(`chat:${chat.id}`, chat)
  pipeline.zadd(`user:chat:${chat.userId}`, Date.now(), `chat:${chat.id}`)
  await pipeline.exec()
}

export async function getSharedChat(id: string) {
  const chat = await redis.hgetall(`chat:${id}`)

  if (!Object.keys(chat).length || !chat.sharePath) {
    return null
  }

  return chat as Chat
}

export async function shareChat(id: string, userId: string = 'anonymous') {
  const chat = await redis.hgetall(`chat:${id}`)

  if (!Object.keys(chat).length || chat.userId !== userId) {
    return null
  }

  const payload = {
    ...chat,
    sharePath: `/share/${id}`
  }

  await redis.hmset(`chat:${id}`, payload)

  return payload
}
