/**
 * Generates HTML templates for PDF generation
 * A5 format: 148mm × 210mm
 */

/**
 * Generate HTML template for a single story page
 * @param {Object} story - Story object with date, story text, and inputs
 * @param {boolean} includeImages - Whether to include images in the PDF
 * @returns {string} HTML string
 */
const generateStoryPageHTML = (story, includeImages = true) => {
  const { date, story: storyText, inputs, title } = story;

  // Format date using UTC to ensure consistency across timezones
  const dateObj = new Date(date);
  const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  const weekday = weekdays[dateObj.getUTCDay()];
  const day = dateObj.getUTCDate();
  const month = months[dateObj.getUTCMonth()];
  const year = dateObj.getUTCFullYear();

  // Extract images from inputs if needed
  let imagesHTML = '';
  if (includeImages && inputs && inputs.length > 0) {
    const imageUrls = inputs
      .filter(input => input.type === 'sent' && input.image)
      .map(input => input.image);

    if (imageUrls.length > 0) {
      const isSingle = imageUrls.length === 1;
      imagesHTML = `
        <div class="images ${isSingle ? 'images-single' : ''}">
          ${imageUrls.map(url => `
            <div class="image-wrapper">
              <img src="${url}" alt="Memory" class="story-image" />
            </div>
          `).join('')}
        </div>
      `;
    }
  }

  const titleHTML = title ? `<div class="story-title">${escapeHtml(title)}</div>` : '';

  return `
    <div class="story-page">
      <div class="story-header">
        <div class="weekday">${weekday}</div>
        <div class="date-line">${day} ${month} ${year}</div>
        ${titleHTML}
        <div class="header-rule"></div>
      </div>
      <div class="story-content">
        <p class="story-text">${escapeHtml(storyText)}</p>
      </div>
      ${imagesHTML}
    </div>
  `;
};

/**
 * Generate complete HTML document for PDF
 * @param {Array} stories - Array of story objects
 * @param {boolean} includeImages - Whether to include images
 * @param {Object} options - Additional options (title, dateRange, etc.)
 * @returns {string} Complete HTML document
 */
const generatePDFHTML = (stories, includeImages = true, options = {}) => {
  const {
    documentTitle = 'My Life Journal',
    dateRange = null
  } = options;

  // Skip days with no story
  const storiesWithContent = stories.filter(s => s.story && s.story.trim().length > 0);

  const storiesHTML = storiesWithContent
    .map(story => generateStoryPageHTML(story, includeImages))
    .join('<div class="page-break"></div>');

  const dateRangeHTML = dateRange
    ? `<div class="cover-range">${dateRange.start} &ndash; ${dateRange.end}</div>`
    : '';

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(documentTitle)}</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    @page {
      size: A5;
      margin: 0;
    }

    body {
      font-family: 'Palatino Linotype', 'Book Antiqua', Palatino, Georgia, serif;
      font-size: 10.5pt;
      line-height: 1.75;
      color: #1a1a2e;
      background: #ffffff;
    }

    /* ─── Cover Page ─────────────────────────── */
    .cover-page {
      width: 148mm;
      height: 210mm;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      background: #1a1a2e;
      page-break-after: always;
      text-align: center;
      padding: 20mm;
    }

    .cover-ornament {
      font-size: 28pt;
      color: #c9a84c;
      margin-bottom: 8mm;
      letter-spacing: 6pt;
    }

    .cover-title {
      font-size: 22pt;
      font-weight: normal;
      color: #f5f0e8;
      letter-spacing: 2pt;
      line-height: 1.3;
      margin-bottom: 5mm;
    }

    .cover-divider {
      width: 25mm;
      height: 0.5mm;
      background: #c9a84c;
      margin: 6mm auto;
    }

    .cover-range {
      font-size: 10pt;
      color: #a89f8c;
      font-style: italic;
      letter-spacing: 1pt;
    }

    .cover-footer-ornament {
      font-size: 16pt;
      color: #c9a84c;
      margin-top: 12mm;
      opacity: 0.6;
    }

    /* ─── Story Pages ────────────────────────── */
    .story-page {
      padding: 15mm;
      min-height: 210mm;
    }

    .story-header {
      margin-bottom: 7mm;
    }

    .weekday {
      font-size: 20pt;
      font-weight: bold;
      color: #1a1a2e;
      letter-spacing: 1pt;
      line-height: 1.1;
    }

    .date-line {
      font-size: 10pt;
      color: #7a6e5f;
      margin-top: 1mm;
      letter-spacing: 0.5pt;
      font-style: italic;
    }

    .story-title {
      font-size: 12pt;
      font-weight: bold;
      color: #c9a84c;
      margin-top: 3mm;
      font-style: italic;
    }

    .header-rule {
      margin-top: 4mm;
      height: 2px;
      background: linear-gradient(to right, #1a1a2e 60%, transparent);
      border: none;
    }

    /* ─── Story Text ─────────────────────────── */
    .story-content {
      margin-bottom: 7mm;
    }

    .story-text {
      text-align: justify;
      hyphens: auto;
      white-space: pre-wrap;
      word-wrap: break-word;
      color: #2c2c3e;
      line-height: 1.8;
    }

    /* ─── Images ─────────────────────────────── */
    .images {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 3mm;
      margin-top: 5mm;
    }

    .images.images-single {
      grid-template-columns: 1fr;
    }

    .image-wrapper {
      background: #f5f0e8;
      border-radius: 2mm;
      overflow: hidden;
      display: flex;
      align-items: center;
      justify-content: center;
      border: 0.5mm solid #e0d8cc;
    }

    .story-image {
      width: 100%;
      height: auto;
      max-height: 65mm;
      object-fit: contain;
      display: block;
    }

    .images.images-single .story-image {
      max-height: 85mm;
    }

    /* ─── Page breaks ────────────────────────── */
    .page-break {
      page-break-after: always;
      height: 0;
    }

    @media print {
      .cover-page {
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      .header-rule {
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
    }
  </style>
</head>
<body>
  <div class="cover-page">
    <div class="cover-ornament">✦ ✦ ✦</div>
    <div class="cover-title">${escapeHtml(documentTitle)}</div>
    <div class="cover-divider"></div>
    ${dateRangeHTML}
    <div class="cover-footer-ornament">✦</div>
  </div>
  ${storiesHTML}
</body>
</html>
  `;
};

/**
 * Escape HTML special characters to prevent XSS
 * @param {string} text - Text to escape
 * @returns {string} Escaped text
 */
const escapeHtml = (text) => {
  if (!text) return '';
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, m => map[m]);
};

module.exports = {
  generatePDFHTML,
  generateStoryPageHTML,
};
