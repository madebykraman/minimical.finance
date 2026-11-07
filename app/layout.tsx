import type {Metadata,Viewport} from "next";
import {Geist} from "next/font/google";
import "./globals.css";
import "./studio.css";
const geist=Geist({subsets:["latin"],display:"swap",variable:"--font-geist"});
export const metadata:Metadata={title:"Finance | Your workspace",description:"Organisation-led invoices, projects, clients and payments."};
export const viewport:Viewport={width:"device-width",initialScale:1,viewportFit:"cover"};
export default function RootLayout({children}:{children:React.ReactNode}){
  return <html lang="en"><body className={geist.variable}>{children}</body></html>;
}
