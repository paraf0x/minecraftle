import { Html, Head, Main, NextScript } from 'next/document'
import Script from 'next/script'

// LFS: analytics only when NEXT_PUBLIC_GA_ID is set at build time, and never
// inside a Discord activity (the iframe URL carries frame_id).
const GA_ID = process.env.NEXT_PUBLIC_GA_ID

export default function Document() {
  return (
    <Html lang="en">
      <Head>
        {GA_ID && (
          <Script id="google-analytics" strategy="afterInteractive">
            {`
              if (!/[?&]frame_id=/.test(location.search)) {
                var s = document.createElement('script');
                s.async = true;
                s.src = 'https://www.googletagmanager.com/gtag/js?id=${GA_ID}';
                document.head.appendChild(s);
                window.dataLayer = window.dataLayer || [];
                function gtag(){dataLayer.push(arguments);}
                gtag('js', new Date());
                gtag('config', '${GA_ID}');
              }
            `}
          </Script>
        )}
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  )
}
