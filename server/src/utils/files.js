import path from 'node:path';

export const ALLOWED_TYPES = {
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

/** Make a filename safe for use in a storage key: ASCII letters, digits, dot, dash, underscore. */
export function sanitizeFilename(name) {
  const ext = path.extname(name).toLowerCase().replace(/[^a-z0-9.]/g, '');
  const base = path
    .basename(name, path.extname(name))
    .normalize('NFKD')
    .replace(/[^\w.-]+/g, '_')
    .replace(/^[._]+|_+$/g, '')
    .slice(0, 100);
  return `${base || 'resume'}${ext}`;
}

/**
 * Check a file is a PDF or DOCX by extension *and* content. Browsers report
 * unreliable MIME types, so the magic bytes are what we actually trust.
 * Returns the canonical MIME type, or null if the file is not allowed.
 */
export function detectResumeType(originalName, buffer) {
  const ext = path.extname(originalName).toLowerCase();
  if (ext === '.pdf' && buffer.subarray(0, 4).toString('latin1') === '%PDF') return ALLOWED_TYPES['.pdf'];
  if (ext === '.docx' && buffer.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))) {
    return ALLOWED_TYPES['.docx'];
  }
  return null;
}

/** Fallback candidate name from a filename like "jane_doe-resume.pdf" -> "jane doe resume". */
export function nameFromFilename(name) {
  // A regex rather than path.extname, which treats ".pdf" as a dotfile with no extension.
  const base = path.basename(name).replace(/\.[^.]*$/, '');
  return base.replace(/[_-]+/g, ' ').trim() || 'Unknown candidate';
}
