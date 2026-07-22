import { IBM_Plex_Sans_Arabic } from 'next/font/google'
import './globals.css'

const ibmPlexArabic = IBM_Plex_Sans_Arabic({
  subsets: ['arabic'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-ibm-plex-arabic',
  display: 'swap',
})

export const metadata = {
  title: 'لوفانو ERP',
  description: 'نظام إدارة موارد المؤسسة — لوفانو',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl" className={ibmPlexArabic.variable} suppressHydrationWarning>
      <body className="font-sans antialiased">{children}</body>
    </html>
  )
}
