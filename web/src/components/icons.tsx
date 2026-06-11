import type { SVGProps } from 'react'

/** Shared base: 24px grid, stroke = currentColor, rounded line icons. */
function Svg(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    />
  )
}

/** Sprout — the Eazio mark. */
export function IconLeaf(props: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...props}>
      <path d="M12 21v-7" />
      <path d="M12 14c0-3.3-2.7-6-6-6H4c0 3.3 2.7 6 6 6Z" />
      <path d="M12 12c0-3.9 3.1-7 7-7h1c0 3.9-3.1 7-7 7Z" />
    </Svg>
  )
}

/** Tracker — bowl with steam. */
export function IconBowl(props: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...props}>
      <path d="M3.5 11h17a8.5 8.5 0 0 1-17 0Z" />
      <path d="M5.5 16.5h13" />
      <path d="M9 4c-.6.7-.6 1.6 0 2.3M12.5 3.3c-.6.7-.6 1.6 0 2.3M16 4c-.6.7-.6 1.6 0 2.3" />
    </Svg>
  )
}

/** Konten — person. */
export function IconUser(props: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="8" r="3.6" />
      <path d="M5 20c0-3.3 3.1-5.5 7-5.5s7 2.2 7 5.5" />
    </Svg>
  )
}

/** Presets — bookmark. */
export function IconBookmark(props: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...props}>
      <path d="M6 4h12v16l-6-3.8L6 20Z" />
    </Svg>
  )
}

export function IconLogout(props: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...props}>
      <path d="M14 5H6.5A1.5 1.5 0 0 0 5 6.5v11A1.5 1.5 0 0 0 6.5 19H14" />
      <path d="M15 12H10" />
      <path d="M18 9l3 3-3 3" />
    </Svg>
  )
}

export function IconPlus(props: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...props}>
      <path d="M12 5v14M5 12h14" />
    </Svg>
  )
}

export function IconStar(props: SVGProps<SVGSVGElement>) {
  return (
    <Svg fill="currentColor" stroke="none" {...props}>
      <path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 17l-5.2 2.7 1-5.8L3.5 9.7l5.9-.9Z" />
    </Svg>
  )
}

export function IconTrash(props: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...props}>
      <path d="M4.5 7h15" />
      <path d="M9.5 7V5.5A1.5 1.5 0 0 1 11 4h2a1.5 1.5 0 0 1 1.5 1.5V7" />
      <path d="M6.5 7l.8 11A1.5 1.5 0 0 0 8.8 19.4h6.4A1.5 1.5 0 0 0 16.7 18l.8-11" />
      <path d="M10 11v5M14 11v5" />
    </Svg>
  )
}

export function IconCheck(props: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...props}>
      <path d="M5 12.5l4.5 4.5L19 7" />
    </Svg>
  )
}

export function IconCheckCircle(props: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12.2l2.6 2.6L16 9.5" />
    </Svg>
  )
}

export function IconClose(props: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...props}>
      <path d="M6 6l12 12M18 6 6 18" />
    </Svg>
  )
}

export function IconAlert(props: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5v5M12 16h.01" />
    </Svg>
  )
}

export function IconSparkle(props: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...props}>
      <path d="M12 3l1.6 5.4L19 10l-5.4 1.6L12 17l-1.6-5.4L5 10l5.4-1.6Z" />
      <path d="M18.5 4.5l.7 2 .8.7-.8.6-.7 2-.6-2-2-.6 2-.7Z" />
    </Svg>
  )
}

export function IconWand(props: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...props}>
      <path d="M5 19l9-9" />
      <path d="M13.5 5.5l1 1M17 4l-.5 2 2-.5M20 9l-2 .5.5 2M15.5 9.5l1 1" />
    </Svg>
  )
}

export function IconSearch(props: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...props}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M20 20l-4.2-4.2" />
    </Svg>
  )
}

export function IconBook(props: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...props}>
      <path d="M5 5a2 2 0 0 1 2-2h11v15H7a2 2 0 0 0-2 2Z" />
      <path d="M5 19a2 2 0 0 1 2-2h11" />
      <path d="M9 7.5h6M9 10.5h5" />
    </Svg>
  )
}

export function IconShare(props: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...props}>
      <path d="M12 15V4" />
      <path d="M8.5 7.5 12 4l3.5 3.5" />
      <path d="M6 12v6.5A1.5 1.5 0 0 0 7.5 20h9a1.5 1.5 0 0 0 1.5-1.5V12" />
    </Svg>
  )
}

export function IconSettings(props: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 2.6v2.3M12 19.1v2.3M21.4 12h-2.3M4.9 12H2.6M18.6 5.4l-1.6 1.6M7 17l-1.6 1.6M18.6 18.6 17 17M7 7 5.4 5.4" />
    </Svg>
  )
}

export function IconClock(props: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 1.8" />
    </Svg>
  )
}

const HEART = 'M12 21s-6.7-4.35-9.33-8.5C.9 9.27 2.4 5.5 6 5.5c2.04 0 3.27 1.2 4 2.2.73-1 1.96-2.2 4-2.2 3.6 0 5.1 3.77 3.33 7C18.7 16.65 12 21 12 21Z'

export function IconHeart(props: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...props}>
      <path d={HEART} />
    </Svg>
  )
}

export function IconHeartFilled(props: SVGProps<SVGSVGElement>) {
  return (
    <Svg fill="currentColor" stroke="none" {...props}>
      <path d={HEART} />
    </Svg>
  )
}

export function IconChevronLeft(props: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...props}>
      <path d="M15 5l-7 7 7 7" />
    </Svg>
  )
}

export function IconCopy(props: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...props}>
      <rect x="9" y="9" width="11" height="11" rx="2.5" />
      <path d="M5 15.5A2 2 0 0 1 4 14V5.5A1.5 1.5 0 0 1 5.5 4H14a2 2 0 0 1 1.5 1" />
    </Svg>
  )
}

export function IconCart(props: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...props}>
      <path d="M3 4h2l2.2 11.2a1.5 1.5 0 0 0 1.5 1.3h8.1a1.5 1.5 0 0 0 1.5-1.2L21 8H6" />
      <circle cx="9.5" cy="20" r="1.4" />
      <circle cx="18" cy="20" r="1.4" />
    </Svg>
  )
}

/** Verlauf — rising bars. */
export function IconChart(props: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...props}>
      <path d="M4 20h16" />
      <rect x="5.5" y="12" width="3.4" height="5.5" rx="1" />
      <rect x="10.3" y="8" width="3.4" height="9.5" rx="1" />
      <rect x="15.1" y="4.5" width="3.4" height="13" rx="1" />
    </Svg>
  )
}

/** Streak — flame. */
export function IconFlame(props: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...props}>
      <path d="M12 21c3.9 0 6.5-2.5 6.5-6 0-2.6-1.4-4.4-2.8-6.1-.4 1-.9 1.7-1.8 2.3.2-2.9-1-5.8-3.9-7.2.3 2.3-.5 3.8-1.8 5.2C6.8 10.7 5.5 12.4 5.5 15c0 3.5 2.6 6 6.5 6Z" />
      <path d="M12 21c-1.8 0-3-1.2-3-2.9 0-1.5 1-2.3 1.9-3.4.7.7 1.1 1 2 1.3 0-.9 0-1.8-.4-2.7 2 1 4.5 3 2.6 5.9-.7 1.1-1.8 1.8-3.1 1.8Z" />
    </Svg>
  )
}

/** Wasser — droplet. */
export function IconDrop(props: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...props}>
      <path d="M12 3.5c3.2 4 6 7 6 10.3A6 6 0 0 1 6 13.8C6 10.5 8.8 7.5 12 3.5Z" />
    </Svg>
  )
}

/** Barcode — scan frame with bars. */
export function IconScan(props: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...props}>
      <path d="M3.5 8V5.5A2 2 0 0 1 5.5 3.5H8M16 3.5h2.5a2 2 0 0 1 2 2V8M20.5 16v2.5a2 2 0 0 1-2 2H16M8 20.5H5.5a2 2 0 0 1-2-2V16" />
      <path d="M7.5 9.5v5M10.5 9.5v5M13.5 9.5v5M16.5 9.5v5" />
    </Svg>
  )
}

/** Schritte — footprints. */
export function IconSteps(props: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...props}>
      <path d="M7.5 3.8c1.7 0 2.6 1.6 2.6 3.6 0 1.5-.5 2.6-1.3 3.6H5.6c-.5-1.2-.8-2.3-.8-3.6 0-2 1-3.6 2.7-3.6Z" />
      <path d="M6 13h3v1.6a1.5 1.5 0 0 1-3 0V13Z" />
      <path d="M16.5 9.3c1.7 0 2.7 1.6 2.7 3.6 0 1.3-.3 2.4-.8 3.6h-3.2c-.8-1-1.3-2.1-1.3-3.6 0-2 .9-3.6 2.6-3.6Z" />
      <path d="M15 18.5h3v1.6a1.5 1.5 0 0 1-3 0v-1.6Z" />
    </Svg>
  )
}

/** Ziel — target rings. */
export function IconTarget(props: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4.5" />
      <circle cx="12" cy="12" r="0.8" fill="currentColor" />
    </Svg>
  )
}

/** Körperwaage — bathroom scale. */
export function IconScale(props: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...props}>
      <rect x="4" y="4" width="16" height="16" rx="3.5" />
      <path d="M8.5 9.5a4.6 4.6 0 0 1 7 0l-2.2 2.2a1.6 1.6 0 0 0-2.6 0Z" />
    </Svg>
  )
}

/** Aktivität — Figur mit offenen Armen. */
export function IconFigure(props: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="6" r="2.4" />
      <path d="M4.5 14.5C6.5 11.6 9 10.2 12 10.2s5.5 1.4 7.5 4.3" />
      <path d="M9.2 20.5c.7-2.6 1.6-4.4 2.8-5.8 1.2 1.4 2.1 3.2 2.8 5.8" />
    </Svg>
  )
}

/** Profil-Formular — Karte mit Zeilen. */
export function IconClipboard(props: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...props}>
      <rect x="5" y="3.5" width="14" height="17" rx="3" />
      <path d="M9 8.5h6M9 12h6M9 15.5h3.5" />
    </Svg>
  )
}

/** Pfeil rechts — weiter. */
export function IconArrowRight(props: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...props}>
      <path d="M4.5 12h15M13.5 6l6 6-6 6" />
    </Svg>
  )
}

/** Kalender — Monatsübersicht. */
export function IconCalendar(props: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...props}>
      <rect x="3.5" y="5" width="17" height="15.5" rx="3" />
      <path d="M3.5 9.5h17M8 3v3.5M16 3v3.5" />
      <path d="M7.5 13h2M11 13h2M14.5 13h2M7.5 16.5h2M11 16.5h2" />
    </Svg>
  )
}

/** Chevron rechts. */
export function IconChevronRight(props: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...props}>
      <path d="m9 5 7 7-7 7" />
    </Svg>
  )
}

/** Kaffeetasse mit Dampf — Frühstück. */
export function IconCoffee(props: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...props}>
      <path d="M4 9.5h11.5V15a4.5 4.5 0 0 1-4.5 4.5H8.5A4.5 4.5 0 0 1 4 15V9.5z" />
      <path d="M15.5 10.5h1.7a2.55 2.55 0 0 1 0 5.1h-1.7" />
      <path d="M7.5 6.5c0-1 .8-1.2.8-2.1M11.2 6.5c0-1 .8-1.2.8-2.1" />
    </Svg>
  )
}

/** Teller — Mittagessen. */
export function IconPlate(props: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4" />
    </Svg>
  )
}

/** Mondsichel — Abendessen. */
export function IconMoon(props: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...props}>
      <path d="M20 14.2A8.3 8.3 0 1 1 9.8 4a6.6 6.6 0 0 0 10.2 10.2z" />
    </Svg>
  )
}

/** Apfel mit Blatt — Snacks. */
export function IconApple(props: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...props}>
      <path d="M12 7.6c-1.1-.9-2.6-1.2-4-.6-2.2.9-3.2 3.6-2.3 6.6.9 3.1 2.9 5.6 4.7 5.4.6-.1 1.1-.4 1.6-.4s1 .3 1.6.4c1.8.2 3.8-2.3 4.7-5.4.9-3-.1-5.7-2.3-6.6-1.4-.6-2.9-.3-4 .6z" />
      <path d="M12 7.6c0-2.2 1.3-3.8 3.4-4.1.2 2.2-1.2 3.9-3.4 4.1z" />
    </Svg>
  )
}
