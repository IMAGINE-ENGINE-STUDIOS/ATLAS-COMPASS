/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

interface Props {
  title?: string
  hazardType?: string
  severity?: number
  magnitude?: number | null
  region?: string | null
  country?: string | null
  summary?: string | null
  eventTime?: string
  lat?: number | null
  lon?: number | null
  url?: string | null
  reportUrl?: string
  onePagerUrl?: string
  siteUrl?: string
}

const SEVERITY_LABELS = ['', 'Advisory', 'Watch', 'Warning', 'Severe', 'Catastrophic']
const SEVERITY_COLORS = ['#6b7280', '#3b82f6', '#eab308', '#f97316', '#ef4444', '#7f1d1d']

const DisasterAlert = ({
  title = 'Disaster alert',
  hazardType = 'event',
  severity = 3,
  magnitude = null,
  region = null,
  country = null,
  summary = null,
  eventTime = new Date().toISOString(),
  lat = null,
  lon = null,
  url = null,
  reportUrl,
  onePagerUrl,
  siteUrl = 'https://sos.atlasmapping.org',
}: Props) => {
  const sev = Math.max(1, Math.min(5, severity))
  const sevLabel = SEVERITY_LABELS[sev] || 'Alert'
  const sevColor = SEVERITY_COLORS[sev] || '#ef4444'
  const location = [region, country].filter(Boolean).join(', ') || 'Location pending'
  const when = new Date(eventTime).toUTCString()

  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>{`${sevLabel} · ${hazardType.toUpperCase()}${magnitude ? ` M${magnitude}` : ''} · ${location}`}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={{ ...badge, backgroundColor: sevColor }}>
            <Text style={badgeText}>
              {sevLabel.toUpperCase()} · {hazardType.toUpperCase()}
              {magnitude ? ` · M${magnitude}` : ''}
            </Text>
          </Section>

          <Heading style={h1}>{title}</Heading>
          <Text style={muted}>{location} · {when}</Text>

          {summary && <Text style={body}>{summary}</Text>}

          <Section style={facts}>
            <FactRow label="Hazard" value={hazardType} />
            <FactRow label="Severity" value={`${sev}/5 (${sevLabel})`} />
            {magnitude != null && <FactRow label="Magnitude" value={String(magnitude)} />}
            <FactRow label="Region" value={location} />
            {lat != null && lon != null && (
              <FactRow label="Epicenter" value={`${lat.toFixed(3)}, ${lon.toFixed(3)}`} />
            )}
            <FactRow label="Event time" value={when} />
          </Section>

          <Section style={ctaWrap}>
            {onePagerUrl && (
              <Link href={onePagerUrl} style={{ ...cta, backgroundColor: sevColor }}>
                View one-pager
              </Link>
            )}
            {reportUrl && (
              <Link href={reportUrl} style={ctaSecondary}>
                Full report
              </Link>
            )}
          </Section>

          {url && (
            <Text style={source}>
              Source: <Link href={url} style={link}>{url}</Link>
            </Text>
          )}

          <Hr style={hr} />
          <Text style={footer}>
            You are receiving this because you subscribed to disaster alerts on{' '}
            <Link href={siteUrl} style={link}>{siteUrl}</Link>.
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

const FactRow = ({ label, value }: { label: string; value: string }) => (
  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
    <tbody>
      <tr>
        <td style={factLabel}>{label}</td>
        <td style={factValue}>{value}</td>
      </tr>
    </tbody>
  </table>
)

const main: React.CSSProperties = {
  backgroundColor: '#ffffff',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  padding: '24px 0',
}
const container: React.CSSProperties = {
  maxWidth: '560px',
  margin: '0 auto',
  padding: '32px 28px',
  backgroundColor: '#0b0f19',
  borderRadius: '12px',
  color: '#e5e7eb',
}
const badge: React.CSSProperties = {
  display: 'inline-block',
  padding: '6px 12px',
  borderRadius: '999px',
  marginBottom: '16px',
}
const badgeText: React.CSSProperties = {
  color: '#ffffff',
  fontSize: '11px',
  fontWeight: 700,
  letterSpacing: '0.08em',
  margin: 0,
}
const h1: React.CSSProperties = { color: '#ffffff', fontSize: '22px', margin: '0 0 4px 0', lineHeight: 1.3 }
const muted: React.CSSProperties = { color: '#9ca3af', fontSize: '13px', margin: '0 0 16px 0' }
const body: React.CSSProperties = { color: '#e5e7eb', fontSize: '14px', lineHeight: 1.6, margin: '0 0 20px 0' }
const facts: React.CSSProperties = {
  backgroundColor: '#111827',
  borderRadius: '8px',
  padding: '12px 16px',
  margin: '16px 0 20px',
}
const factLabel: React.CSSProperties = { color: '#9ca3af', fontSize: '12px', padding: '6px 0', width: '35%' }
const factValue: React.CSSProperties = { color: '#f3f4f6', fontSize: '13px', padding: '6px 0', fontWeight: 500 }
const ctaWrap: React.CSSProperties = { margin: '4px 0 16px' }
const cta: React.CSSProperties = {
  display: 'inline-block',
  padding: '11px 20px',
  borderRadius: '8px',
  color: '#ffffff',
  fontSize: '14px',
  fontWeight: 600,
  textDecoration: 'none',
  marginRight: '8px',
}
const ctaSecondary: React.CSSProperties = {
  display: 'inline-block',
  padding: '11px 20px',
  borderRadius: '8px',
  color: '#e5e7eb',
  fontSize: '14px',
  fontWeight: 600,
  textDecoration: 'none',
  border: '1px solid #374151',
}
const source: React.CSSProperties = { color: '#9ca3af', fontSize: '12px', margin: '12px 0 0' }
const link: React.CSSProperties = { color: '#60a5fa' }
const hr: React.CSSProperties = { borderColor: '#1f2937', margin: '20px 0' }
const footer: React.CSSProperties = { color: '#6b7280', fontSize: '11px', margin: 0 }

export const template = {
  component: DisasterAlert,
  subject: (data: Props) => {
    const sev = SEVERITY_LABELS[Math.max(1, Math.min(5, data?.severity ?? 3))]
    const mag = data?.magnitude ? ` M${data.magnitude}` : ''
    const where = data?.region || data?.country || 'nearby'
    return `⚠ ${sev}: ${(data?.hazardType || 'event').toUpperCase()}${mag} near ${where}`
  },
  displayName: 'Disaster alert',
  previewData: {
    title: 'M6.4 earthquake near Antakya, Türkiye',
    hazardType: 'earthquake',
    severity: 4,
    magnitude: 6.4,
    region: 'Antakya',
    country: 'Türkiye',
    summary: 'A significant earthquake was detected. Aftershocks likely. Check local advisories.',
    eventTime: new Date().toISOString(),
    lat: 36.2,
    lon: 36.15,
    url: 'https://earthquake.usgs.gov',
    onePagerUrl: 'https://sos.atlasmapping.org/alerts/example',
    reportUrl: 'https://sos.atlasmapping.org/alerts/example/report',
  },
  to: (data: any) => data?.recipient ?? '',
} satisfies TemplateEntry