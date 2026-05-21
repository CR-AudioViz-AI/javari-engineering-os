// apps/cron-master/src/app/layout.tsx
// CR AudioViz AI · EIN: 39-3646201 · May 2026
import type { Metadata } from 'next'
export const dynamic = 'force-dynamic'
export const metadata: Metadata = {
  title: 'Javari Engineering OS | CR AudioViz AI — EIN 39-3646201',
  description: 'Engineering operations system. CR AudioViz AI, EIN 39-3646201.'
}
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en"><body style={{ margin:0,padding:0,fontFamily:'system-ui' }}>
      <div style={{ background:'rgba(0,0,0,0.9)',padding:'6px 20px',display:'flex',alignItems:'center',justifyContent:'space-between',position:'sticky',top:0,zIndex:9999 }}>
        <a href="https://craudiovizai.com" style={{ display:'flex',alignItems:'center',gap:8,textDecoration:'none',color:'#fff',fontSize:13,fontWeight:600 }}>
          <span>⚡</span><span style={{ color:'#1E3A5F' }}>Engineering OS</span>
          <span style={{ color:'#374151',fontSize:11,marginLeft:4 }}>· CR AudioViz AI · EIN 39-3646201</span>
        </a>
        <a href="https://craudiovizai.com/auth/signup" style={{ background:'#1E3A5F',color:'#fff',borderRadius:6,padding:'4px 14px',fontSize:12,fontWeight:700,textDecoration:'none' }}>Admin →</a>
      </div>
      {children}
      <footer style={{ background:'#050608',borderTop:'1px solid rgba(255,255,255,0.05)',padding:'16px 24px',textAlign:'center' }}>
        <p style={{ color:'#1f2937',fontSize:11,margin:0 }}>© 2026 CR AudioViz AI, LLC — EIN: 39-3646201 · <a href="https://craudiovizai.com" style={{ color:'#374151',textDecoration:'none' }}>craudiovizai.com</a> · <a href="https://craudiovizai.com/auth/signup" style={{ color:'#1E3A5F',textDecoration:'none' }}>Sign Up Free</a></p>
      </footer>
    </body></html>
  )
}
// ts:1779331824
// rebuild:1779332204
