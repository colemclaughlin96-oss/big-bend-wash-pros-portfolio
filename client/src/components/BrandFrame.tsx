import { CSSProperties, ReactNode } from "react";

export type Brand = {
  companyName: string;
  logoUrl?: string | null;
  primaryColor: string;
  accentColor: string;
  backgroundColor?: string | null;
  textColor?: string | null;
  cardColor?: string | null;
  companyEmail?: string | null;
  companyPhone?: string | null;
};

const DEFAULT_BG = "#f7f5f0";
const DEFAULT_TEXT = "#1c1917";
const DEFAULT_CARD = "#ffffff";

/**
 * Wraps customer-facing content and injects the workspace branding colors as
 * CSS variables so all child elements using the .brand-* utilities pick up the
 * configured colors. This is how branding propagates consistently to the
 * customer-facing quote form & quote page.
 */
export function BrandFrame({
  brand,
  children,
  showFooter = true,
  hideHeader = false,
}: {
  brand: Brand;
  children: ReactNode;
  showFooter?: boolean;
  hideHeader?: boolean;
}) {
  const bg = brand.backgroundColor || DEFAULT_BG;
  const text = brand.textColor || DEFAULT_TEXT;
  const card = brand.cardColor || DEFAULT_CARD;

  const style = {
    "--brand-primary": brand.primaryColor,
    "--brand-accent": brand.accentColor,
    "--brand-bg": bg,
    "--brand-text": text,
    "--brand-card": card,
    backgroundColor: bg,
    color: text,
  } as CSSProperties;

  return (
    <div style={style} className="min-h-screen flex flex-col">
      {hideHeader ? null : <header
        className="border-b sticky top-0 z-30 backdrop-blur"
        style={{ backgroundColor: `${card}cc`, borderColor: "rgba(0,0,0,0.08)" }}
      >
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            {brand.logoUrl ? (
              <img
                src={brand.logoUrl}
                alt={brand.companyName}
                className="h-9 w-auto max-w-[200px] object-contain"
              />
            ) : (
              <div className="flex items-center gap-2">
                <div
                  className="h-9 w-9 rounded-lg flex items-center justify-center font-display font-bold text-lg"
                  style={{ background: brand.primaryColor, color: "#fff" }}
                >
                  {brand.companyName.charAt(0)}
                </div>
                <span className="font-display text-lg font-semibold truncate">
                  {brand.companyName}
                </span>
              </div>
            )}
          </div>
          {brand.companyPhone ? (
            <a
              href={`tel:${brand.companyPhone}`}
              className="text-sm font-medium brand-primary-text hidden sm:inline"
            >
              {brand.companyPhone}
            </a>
          ) : null}
        </div>
      </header>}

      <main className="flex-1">{children}</main>

      {showFooter ? (
        <footer className="border-t" style={{ backgroundColor: card, borderColor: "rgba(0,0,0,0.08)" }}>
          <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 flex flex-col sm:flex-row items-center justify-between gap-2 text-sm opacity-70">
            <span>
              © {new Date().getFullYear()} {brand.companyName}
            </span>
            <div className="flex items-center gap-4">
              {brand.companyEmail ? <span>{brand.companyEmail}</span> : null}
              {brand.companyPhone ? <span>{brand.companyPhone}</span> : null}
            </div>
          </div>
        </footer>
      ) : null}
    </div>
  );
}
