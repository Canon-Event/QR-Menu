type BrandLogoProps = {
  className?: string
  withBackground?: boolean
}

export default function BrandLogo({ className = '', withBackground = false }: BrandLogoProps) {
  return (
    <img
      src={withBackground ? '/assets/brand/wiit-logo.png' : '/assets/brand/wiit-logo-transparent.png'}
      alt="WIIT — What’s In It?"
      className={`wiit-logo ${className}`.trim()}
    />
  )
}
