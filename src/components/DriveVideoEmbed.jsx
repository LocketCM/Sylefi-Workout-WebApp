import { ExternalLink } from 'lucide-react';
import { toDriveEmbedUrl, isDriveUrl } from '@/lib/driveVideo';

// Renders a Google Drive video as an embedded /preview iframe.
//
// Google's Drive player is notorious for playing audio over a black screen
// when it runs in a restricted third-party context — an installed PWA, an
// in-app webview, or a browser that blocks third-party cookies — or while a
// freshly uploaded file is still transcoding. We can't fix Google's player
// from inside the iframe, so we harden around it:
//   1. Grant every permission the player might want (autoplay, fullscreen,
//      picture-in-picture, encrypted-media) so a missing permission is ruled
//      out as the cause.
//   2. Always surface an obvious "open directly in Drive" escape hatch right
//      under the player. That link opens in a normal first-party tab where
//      playback works even when the embed shows a black screen.
export default function DriveVideoEmbed({ url, title, showFallbackLink = true }) {
  const embedUrl = toDriveEmbedUrl(url);
  const driveLink = isDriveUrl(url) ? url : null;

  if (!embedUrl) {
    return <p className="text-xs text-muted-foreground">No embeddable preview.</p>;
  }

  return (
    <div className="space-y-1.5">
      <div className="aspect-video rounded-lg overflow-hidden bg-black">
        <iframe
          src={embedUrl}
          title={title}
          className="w-full h-full"
          allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          loading="lazy"
        />
      </div>
      {showFallbackLink && driveLink && (
        <a
          href={driveLink}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-muted-foreground hover:text-primary inline-flex items-center gap-1"
        >
          <ExternalLink size={11} /> Black screen or no video? Open in Drive
        </a>
      )}
    </div>
  );
}
