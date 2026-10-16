import type { Metadata } from 'next'
import './globals.css'
export const metadata:Metadata={title:'Forma Studio — habite suas ideias',description:'Da planta ao espaço vivido. Importe, explore e personalize sua casa.'}
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="pt-BR"><body>{children}</body></html>}
