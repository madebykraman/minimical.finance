import type {Metadata,Viewport} from "next";
import "./globals.css";
import "./studio.css";
export const metadata:Metadata={title:"Finance | Your workspace",description:"Organisation-led invoices, projects, clients and payments."};
export const viewport:Viewport={width:"device-width",initialScale:1,viewportFit:"cover"};
export default function RootLayout({children}:{children:React.ReactNode}){
  return <html lang="en"><body>{children}</body></html>;
}
