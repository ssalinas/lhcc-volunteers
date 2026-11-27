import { env } from '../config/env.js';

/** Base URL for links in emails — the SPA's origin (differs from the API origin only in local dev). */
export function appUrl(path: string) {
  return `${(env.APP_URL ?? env.BETTER_AUTH_URL).replace(/\/$/, '')}${path}`;
}

export function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const COLORS = { primary: '#0a7dcd', success: '#2e7d5b', muted: '#6b7280', border: '#e2e6ee', danger: '#c0392b' };

/**
 * A big, finger-friendly email button. Table-based with inline styles because that's what
 * renders reliably across Gmail/Outlook/Apple Mail (no <style> blocks, no flexbox).
 */
export function emailButton(href: string, label: string, variant: 'primary' | 'success' | 'secondary' = 'primary') {
  const bg = variant === 'primary' ? COLORS.primary : variant === 'success' ? COLORS.success : '#ffffff';
  const fg = variant === 'secondary' ? '#231f20' : '#ffffff';
  const border = variant === 'secondary' ? `2px solid ${COLORS.border}` : `2px solid ${bg}`;
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="display:inline-table;margin:4px 6px 4px 0"><tr><td style="border-radius:8px;background:${bg};border:${border}"><a href="${escapeHtml(href)}" style="display:inline-block;padding:12px 20px;font-family:Arial,sans-serif;font-size:17px;font-weight:bold;color:${fg};text-decoration:none;border-radius:8px">${escapeHtml(label)}</a></td></tr></table>`;
}

/** Wraps body HTML in a simple, large-type, single-column layout. */
export function emailLayout(bodyHtml: string) {
  return `<!doctype html><html><body style="margin:0;padding:0;background:#f5f7fb"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f7fb"><tr><td align="center" style="padding:24px 12px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px"><tr><td style="padding:28px 24px;font-family:Arial,sans-serif;font-size:17px;line-height:1.5;color:#231f20">${bodyHtml}</td></tr></table><p style="font-family:Arial,sans-serif;font-size:13px;color:${COLORS.muted};margin:16px 0 0">Longwood Hills Congregational Church · Volunteer Schedule</p></td></tr></table></body></html>`;
}

export const emailColors = COLORS;
