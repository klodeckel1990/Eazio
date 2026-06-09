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
