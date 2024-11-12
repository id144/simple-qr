const express = require('express');
const QRCode = require('qrcode');
const app = express();

// Set EJS as the templating engine
app.set('view engine', 'ejs');

// Serve static files (e.g., CSS)
app.use(express.static('public'));

// Middleware to parse form data
app.use(express.urlencoded({ extended: true }));

// Handle both GET and POST requests on the root URL
app.all('/', (req, res) => {
  if (req.method === 'POST') {
    const { url, errorCorrectionLevel } = req.body;

    if (!url) {
      return res.render('index', { qrCodeUrl: null, error: 'Please provide a valid URL.', errorCorrectionLevel: 'M' });
    }

    // Generate the QR code with the specified errorCorrectionLevel
    QRCode.toDataURL(
      url,
      { errorCorrectionLevel: errorCorrectionLevel || 'M' }, // Default to 'M' if not provided
      (err, qrCodeUrl) => {
        if (err) {
          console.error(err);
          return res.render('index', { qrCodeUrl: null, error: 'Failed to generate QR code.', errorCorrectionLevel });
        }

        // Render the QR code on the page
        res.render('index', { qrCodeUrl, error: null, errorCorrectionLevel });
      }
    );
  } else {
    // Render the initial form with no QR code and default error correction level 'M'
    res.render('index', { qrCodeUrl: null, error: null, errorCorrectionLevel: 'M' });
  }
});

// Export the app as a serverless function
module.exports = app;