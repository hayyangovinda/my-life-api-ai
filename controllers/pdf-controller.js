const puppeteer = require('puppeteer');
const DayChat = require('../models/day-chat-model');
const { decrypt } = require('../utils/crypto');
const { generatePDFHTML } = require('../utils/pdf-template');

/**
 * Generate PDF for a single story
 * POST /api/v1/pdf/story/:id?includeImages=true
 */
const generateStoryPDF = async (req, res) => {
  let browser;

  try {
    const { id } = req.params;
    const includeImages = req.query.includeImages === 'true' || req.body.includeImages === true;

    // Fetch story with user authentication
    const dayChatDoc = await DayChat.findOne({
      _id: id,
      createdBy: req.user.userId
    });

    if (!dayChatDoc) {
      return res.status(404).json({ message: 'Story not found' });
    }

    // Decrypt the story
    let plainStory = '';
    if (dayChatDoc.story && dayChatDoc.story.encryptedData) {
      try {
        plainStory = decrypt(dayChatDoc.story);
      } catch (err) {
        console.error('Decryption error:', err);
        return res.status(500).json({ message: 'Error decrypting story' });
      }
    }

    // Prepare story object for template
    const storyData = {
      date: dayChatDoc.date,
      story: plainStory,
      inputs: dayChatDoc.inputs || [],
      title: dayChatDoc.title || null
    };

    // Generate HTML
    const html = generatePDFHTML([storyData], includeImages, {
      documentTitle: 'My Life Journal',
      dateRange: null
    });

    console.log('Generating PDF for story:', id);
    console.log('Include images:', includeImages);
    console.log('HTML length:', html.length);

    // Generate PDF with Puppeteer
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    console.log('Puppeteer browser launched');

    const page = await browser.newPage();

    // Set a longer timeout for loading
    await page.setDefaultNavigationTimeout(60000);

    // Load HTML content with a more lenient wait condition
    await page.setContent(html, {
      waitUntil: 'domcontentloaded', // Changed from 'networkidle0' for faster/more reliable loading
      timeout: 30000
    });

    // Wait a bit for any remaining resources using standard setTimeout wrapped in Promise
    await new Promise(resolve => setTimeout(resolve, 1000));

    const pdfBuffer = await page.pdf({
      format: 'A5',
      printBackground: true,
      preferCSSPageSize: false,
      margin: {
        top: '15mm',
        right: '15mm',
        bottom: '15mm',
        left: '15mm'
      }
    });

    await browser.close();

    console.log('PDF generated successfully, buffer size:', pdfBuffer.length, 'bytes');

    // Format filename with date
    const dateObj = new Date(dayChatDoc.date);
    const dateStr = dateObj.toISOString().split('T')[0]; // YYYY-MM-DD
    const filename = `journal-${dateStr}.pdf`;

    // Stream PDF to client with proper headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.setHeader('Cache-Control', 'no-cache');

    console.log('Sending PDF to client:', filename);
    // Send buffer directly without any transformation
    res.end(pdfBuffer, 'binary');

  } catch (err) {
    console.error('Error generating PDF:', err);
    console.error('Error stack:', err.stack);
    if (browser) {
      try {
        await browser.close();
      } catch (closeErr) {
        console.error('Error closing browser:', closeErr);
      }
    }
    res.status(500).json({ message: 'Error generating PDF', error: err.message });
  }
};

/**
 * Generate PDF for date range
 * POST /api/v1/pdf/date-range
 * Body: { startDate, endDate, includeImages }
 */
const generateDateRangePDF = async (req, res) => {
  let browser;

  try {
    const { startDate, endDate, includeImages = true } = req.body;

    if (!startDate || !endDate) {
      return res.status(400).json({ message: 'startDate and endDate are required' });
    }

    // Parse dates
    const start = new Date(startDate);
    const end = new Date(endDate);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({ message: 'Invalid date format' });
    }

    if (start > end) {
      return res.status(400).json({ message: 'startDate must be before endDate' });
    }

    // Fetch stories in date range
    const dayChats = await DayChat.find({
      createdBy: req.user.userId,
      date: {
        $gte: start,
        $lte: end
      }
    }).sort({ date: 1 });

    if (dayChats.length === 0) {
      return res.status(404).json({ message: 'No stories found in this date range' });
    }

    // Decrypt and prepare stories
    const storiesData = dayChats.map(dayChat => {
      let plainStory = '';
      if (dayChat.story && dayChat.story.encryptedData) {
        try {
          plainStory = decrypt(dayChat.story);
        } catch (err) {
          console.error('Decryption error for story:', dayChat._id, err);
          plainStory = '[Story decryption failed]';
        }
      }

      return {
        date: dayChat.date,
        story: plainStory,
        inputs: dayChat.inputs || [],
        title: dayChat.title || null
      };
    });

    // Format date range for title
    const startFormatted = start.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
    const endFormatted = end.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });

    // Generate HTML
    const html = generatePDFHTML(storiesData, includeImages, {
      documentTitle: 'My Life Journal',
      dateRange: {
        start: startFormatted,
        end: endFormatted
      }
    });

    console.log('Generating PDF for date range:', startFormatted, 'to', endFormatted);
    console.log('Number of stories:', storiesData.length);
    console.log('Include images:', includeImages);
    console.log('HTML length:', html.length);

    // Generate PDF with Puppeteer
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    console.log('Puppeteer browser launched');

    const page = await browser.newPage();

    // Set a longer timeout for loading
    await page.setDefaultNavigationTimeout(60000);

    // Load HTML content with a more lenient wait condition
    await page.setContent(html, {
      waitUntil: 'domcontentloaded', // Changed from 'networkidle0' for faster/more reliable loading
      timeout: 30000
    });

    // Wait a bit for any remaining resources using standard setTimeout wrapped in Promise
    await new Promise(resolve => setTimeout(resolve, 1000));

    const pdfBuffer = await page.pdf({
      format: 'A5',
      printBackground: true,
      preferCSSPageSize: false,
      margin: {
        top: '15mm',
        right: '15mm',
        bottom: '15mm',
        left: '15mm'
      }
    });

    await browser.close();

    console.log('PDF generated successfully, buffer size:', pdfBuffer.length, 'bytes');

    // Verify PDF header (should start with %PDF)
    const pdfHeader = pdfBuffer.toString('utf8', 0, 4);
    console.log('PDF header:', pdfHeader);
    if (!pdfHeader.startsWith('%PDF')) {
      console.error('WARNING: PDF buffer does not have valid PDF header!');
    }

    // Format filename with date range
    const startStr = start.toISOString().split('T')[0];
    const endStr = end.toISOString().split('T')[0];
    const filename = `journal-${startStr}_to_${endStr}.pdf`;

    // Stream PDF to client with proper headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.setHeader('Cache-Control', 'no-cache');

    console.log('Sending PDF to client:', filename);
    // Send buffer directly without any transformation
    res.end(pdfBuffer, 'binary');

  } catch (err) {
    console.error('Error generating PDF:', err);
    console.error('Error stack:', err.stack);
    if (browser) {
      try {
        await browser.close();
      } catch (closeErr) {
        console.error('Error closing browser:', closeErr);
      }
    }
    res.status(500).json({ message: 'Error generating PDF', error: err.message });
  }
};

module.exports = {
  generateStoryPDF,
  generateDateRangePDF
};
