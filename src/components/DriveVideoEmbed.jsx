import { useState } from 'react';
import { ExternalLink, Play } from 'lucide-react';
import { toDriveEmbedUrl, isDriveUrl } from '@/lib/driveVideo';

// Renders a Google Drive exercise demo.
//
// Google's embedded /preview player no longer works reliably in MOBILE
// browsers: they block the third-party cookies Google's player needs to fetch
// the video stream, so the iframe shows a black screen (audio still plays).
// This broke on its own as mobile browsers tightened privacy rules — nothing
// in this app changed. Desktop browsers are still lenient, so the embed works
// there.
//
// Fix without re-hosting anything: on touch/mobile devices we skip the broken
// embed and open the video in Google Drive directly — the one path confirmed to
// still play on phones. Desktop keeps the inline player.
function prefersDriveLink() {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  // Coarse primary pointer == phone/tablet. Mouse-driven desktops stay on the
  // inline embed; touchscreen laptops with a trackpad report a fine primary
  // pointer and also stay inline.
  return window.matchMedia('(pointer: coarse)').matches;
}

export default function DriveVideoEmbed({ url, title, showFallbackLink = true }) {
  const [openInDrive] = useState(prefersDriveLink);
  const embedUrl = toDriveEmbedUrl(url);
  const driveLink = isDriveUrl(url) ? url : null;

  if (!embedUrl) {
    return <p className="text-xs text-muted-foreground">No embeddable preview.</p>;
  }

  // Mobile / touch: present a tap target that opens the working Drive link
  // instead of a black iframe.
  if (openInDrive && driveLink) {
    return (
      <a
        href={driveLink}
        target="_blank"
        rel="noopener noreferrer"
        title={title}
        className="flex aspect-video w-full items-center justify-center gap-2 rounded-lg bg-black px-3 text-center text-sm font-medium text-white/90 transition active:opacity-80"
      >
        <Play size={18} className="fill-current shrink-0" />
        Watch demo in Google Drive
        <ExternalLink size={14} className="shrink-0" />
      </a>
    );
  }

  // Desktop: the inline embed still works here.
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
