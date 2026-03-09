import { useEffect, useRef } from 'react'
import './ExperienceBackground.css'

export default function ExperienceBackground() {
    const canvasRef = useRef(null)

    useEffect(() => {
        const canvas = canvasRef.current
        const ctx = canvas.getContext('2d')
        let width = canvas.width = window.innerWidth
        let height = canvas.height = window.innerHeight

        const particles = []
        const count = 40

        class Particle {
            constructor() {
                this.init()
            }

            init() {
                this.x = Math.random() * width
                this.y = Math.random() * height
                this.size = Math.random() * 2 + 1
                this.speedX = (Math.random() - 0.5) * 0.5
                this.speedY = (Math.random() - 0.5) * 0.5
                this.color = Math.random() > 0.5 ? '#ff005511' : '#00ffcc11'
            }

            update() {
                this.x += this.speedX
                this.y += this.speedY

                if (this.x > width) this.x = 0
                if (this.x < 0) this.x = width
                if (this.y > height) this.y = 0
                if (this.y < 0) this.y = height
            }

            draw() {
                ctx.fillStyle = this.color
                ctx.beginPath()
                ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2)
                ctx.fill()
            }
        }

        for (let i = 0; i < count; i++) {
            particles.push(new Particle())
        }

        let animationFrame
        const animate = () => {
            ctx.clearRect(0, 0, width, height)

            // Draw a subtle digital mandala in the center
            const time = Date.now() * 0.0005
            const centerX = width / 2
            const centerY = height / 2

            ctx.save()
            ctx.translate(centerX, centerY)
            ctx.rotate(time * 0.2)

            for (let i = 0; i < 8; i++) {
                ctx.rotate(Math.PI / 4)
                ctx.strokeStyle = i % 2 === 0 ? '#ff005505' : '#00ffcc05'
                ctx.lineWidth = 1
                ctx.beginPath()
                ctx.moveTo(100, 0)
                ctx.lineTo(width * 0.8, 0)
                ctx.stroke()

                // Sacred geometry node
                ctx.beginPath()
                ctx.arc(200 + Math.sin(time + i) * 50, 0, 2, 0, Math.PI * 2)
                ctx.fillStyle = i % 2 === 0 ? '#ff005511' : '#00ffcc11'
                ctx.fill()
            }
            ctx.restore()

            particles.forEach(p => {
                p.update()
                p.draw()
            })

            animationFrame = requestAnimationFrame(animate)
        }

        animate()

        const handleResize = () => {
            width = canvas.width = window.innerWidth
            height = canvas.height = window.innerHeight
        }

        window.addEventListener('resize', handleResize)
        return () => {
            cancelAnimationFrame(animationFrame)
            window.removeEventListener('resize', handleResize)
        }
    }, [])

    return (
        <div className="experience-bg">
            <canvas ref={canvasRef} />
            <div className="bg-overlay" />
            <div className="bg-gradient-radial" />
        </div>
    )
}
