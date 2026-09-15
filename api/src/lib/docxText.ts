import JSZip from 'jszip';

// Extract plain text from a .docx buffer (paragraphs → newlines). Uses jszip
// (already present via the `docx` writer dep, now declared). Read-only; used to
// import old delivered scenario documents into the rich Script model.
export async function docxToText(buffer: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buffer);
  const doc = zip.file('word/document.xml');
  if (!doc) throw new Error('Не е валиден .docx (нема word/document.xml).');
  const xml = await doc.async('string');
  return xml
    .replace(/<\/w:p>/gi, '\n')
    .replace(/<w:tab[^>]*\/>/gi, '\t')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/[ \t]+\n/g, '\n')
    .trim();
}
