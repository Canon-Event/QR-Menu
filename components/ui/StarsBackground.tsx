'use client'

import { useEffect, useRef } from 'react'

interface Props {
  factor?: number
  speed?: number
  starColor?: string
}

interface Star {
  x: number
  y: number
  radius: number
  phase: number
  drift: number
}

export default function StarsBackground({
  factor = 0.05,
  speed = 50,
  starColor = '#ffffff',
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return

    const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)')
    let width = 0
    let height = 0
    let frame = 0
    let lastFrame = 0
    let stars: Star[] = []

    const makeStars = () => {
      const density = Math.max(0, Math.min(factor, 0.2))
      const count = Math.floor((width * height / 10000) * density * 100)
      stars = Array.from({ length: count }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        radius: Math.random() * 1.15 + 0.35,
        phase: Math.random() * Math.PI * 2,
        drift: Math.random() * 0.3 + 0.08,
      }))
    }

    const resize = () => {
      const bounds = canvas.getBoundingClientRect()
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2)
      width = bounds.width
      height = bounds.height
      canvas.width = Math.round(width * pixelRatio)
      canvas.height = Math.round(height * pixelRatio)
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)
      makeStars()
      draw(performance.now())
    }

    const draw = (time: number) => {
      if (!width || !height) return
      const elapsed = lastFrame ? Math.min(time - lastFrame, 50) : 16
      lastFrame = time
      context.clearRect(0, 0, width, height)
      context.fillStyle = starColor
      const motionScale = motionPreference.matches ? 0 : Math.max(0, speed) / 50

      for (const star of stars) {
        const twinkle = 0.55 + Math.sin(time * 0.001 + star.phase) * 0.3
        context.globalAlpha = twinkle
        context.beginPath()
        context.arc(star.x, star.y, star.radius, 0, Math.PI * 2)
        context.fill()
        star.y += star.drift * motionScale * (elapsed / 16)
        if (star.y > height + 2) {
          star.y = -2
          star.x = Math.random() * width
        }
      }
      context.globalAlpha = 1

      if (!motionPreference.matches) frame = window.requestAnimationFrame(draw)
    }

    resize()
    window.addEventListener('resize', resize)
    const observer = new ResizeObserver(resize)
    observer.observe(canvas)

    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener('resize', resize)
      observer.disconnect()
    }
  }, [factor, speed, starColor])

  return <canvas ref={canvasRef} className="stars-background" aria-hidden="true" />
}
