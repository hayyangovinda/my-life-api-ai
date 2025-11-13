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

  // Format date
  const dateObj = new Date(date);
  const formattedDate = dateObj.toLocaleDateString('en-GB', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  // Extract images from inputs if needed
  let imagesHTML = '';
  if (includeImages && inputs && inputs.length > 0) {
    const imageUrls = inputs
      .filter(input => input.type === 'sent' && input.image)
      .map(input => input.image);

    if (imageUrls.length > 0) {
      imagesHTML = `
        <div class="images">
          ${imageUrls.map(url => `
            <img src="${url}" alt="Memory" class="story-image" />
          `).join('')}
        </div>
      `;
    }
  }

  // Generate title section
  const titleHTML = title ? `<h2 class="story-title">${escapeHtml(title)}</h2>` : '';

  return `
    <div class="story-page">
      <div class="story-header">
        <h1 class="story-date">${formattedDate}</h1>
        ${titleHTML}
      </div>
      <div class="story-content">
        ${storyText ? `<p class="story-text">${escapeHtml(storyText)}</p>` : '<p class="no-story">No story available for this date.</p>'}
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

  // Generate header with date range if provided
  let headerHTML = `<h1 class="document-title">${escapeHtml(documentTitle)}</h1>`;
  if (dateRange) {
    const { start, end } = dateRange;
    headerHTML += `<p class="date-range">${start} - ${end}</p>`;
  }

  // Generate story pages
  const storiesHTML = stories
    .map(story => generateStoryPageHTML(story, includeImages))
    .join('<div class="page-break"></div>');

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
      margin: 15mm;
    }

    body {
      font-family: 'Georgia', 'Times New Roman', serif;
      font-size: 11pt;
      line-height: 1.6;
      color: #2c3e50;
      background: #ffffff;
    }

    .document-title {
      font-size: 24pt;
      font-weight: bold;
      text-align: center;
      margin-bottom: 10mm;
      color: #1a1a1a;
      border-bottom: 2px solid #3498db;
      padding-bottom: 5mm;
    }

    .date-range {
      text-align: center;
      font-size: 11pt;
      color: #7f8c8d;
      margin-bottom: 15mm;
      font-style: italic;
    }

    .story-page {
      margin-bottom: 10mm;
    }

    .story-header {
      margin-bottom: 6mm;
      border-left: 4px solid #3498db;
      padding-left: 4mm;
    }

    .story-date {
      font-size: 14pt;
      font-weight: bold;
      color: #2c3e50;
      margin-bottom: 2mm;
    }

    .story-title {
      font-size: 12pt;
      font-weight: 600;
      color: #34495e;
      font-style: italic;
    }

    .story-content {
      margin-bottom: 6mm;
    }

    .story-text {
      text-align: justify;
      hyphens: auto;
      white-space: pre-wrap;
      word-wrap: break-word;
    }

    .no-story {
      font-style: italic;
      color: #95a5a6;
    }

    .images {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(40mm, 1fr));
      gap: 3mm;
      margin-top: 5mm;
    }

    .story-image {
      width: 100%;
      height: auto;
      border-radius: 2mm;
      box-shadow: 0 1mm 3mm rgba(0, 0, 0, 0.1);
      object-fit: cover;
      max-height: 50mm;
    }

    .page-break {
      page-break-after: always;
      height: 0;
      margin: 0;
      padding: 0;
    }

    /* Print-specific styles */
    @media print {
      body {
        background: white;
      }

      .story-page {
        page-break-inside: avoid;
      }
    }
  </style>
</head>
<body>
  <div class="cover-page">
    ${headerHTML}
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
