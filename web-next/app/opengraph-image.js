import { ImageResponse } from 'next/og'

export const size = {
  width: 1200,
  height: 630,
}

export const contentType = 'image/png'

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '56px',
          color: '#f8fbff',
          background:
            'radial-gradient(circle at 14% 10%, rgba(255, 110, 156, 0.35), transparent 34%), radial-gradient(circle at 82% 80%, rgba(89, 201, 255, 0.28), transparent 32%), linear-gradient(135deg, #070d22 0%, #0f1130 50%, #150f2d 100%)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '14px',
            fontSize: '28px',
            fontWeight: 700,
            letterSpacing: '-0.02em',
          }}
        >
          <div
            style={{
              width: '18px',
              height: '18px',
              borderRadius: '999px',
              background: '#4ff0d9',
              boxShadow: '0 0 20px rgba(79, 240, 217, 0.75)',
            }}
          />
          MuhDikhai
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          <div style={{ fontSize: '78px', fontWeight: 800, letterSpacing: '-0.05em', lineHeight: 1 }}>
            Vibe-First Random Chat
          </div>
          <div style={{ fontSize: '34px', color: 'rgba(232, 241, 255, 0.88)', lineHeight: 1.28 }}>
            Match instantly. Filter by vibe. Join the anonymous vibe registry.
          </div>
        </div>

        <div style={{ display: 'flex', gap: '14px' }}>
          {['Filtered by Vibe', 'Encrypted Calls', 'Global Sanctuary'].map((label) => (
            <div
              key={label}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '999px',
                padding: '10px 18px',
                fontSize: '24px',
                fontWeight: 600,
                color: 'rgba(244, 249, 255, 0.95)',
                background: 'rgba(255, 255, 255, 0.12)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
              }}
            >
              {label}
            </div>
          ))}
        </div>
      </div>
    ),
    {
      ...size,
    }
  )
}
