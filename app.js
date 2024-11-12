const express = require('express');
const path = require('path');
const qrcode = require('qrcode');
const ejs = require('ejs'); // Use EJS as the templating engine

const app = express();
const PORT = process.env.PORT || 3000;

// Set EJS as the templating engine
app.set('view engine', 'ejs');

// Serve static files from the "public" directory
app.use(express.static(path.join(__dirname, 'public')));

// Root route to handle both form rendering and QR code generation
app.get('/', (req, res) => {
  const { url, errorCorrectionLevel, mode } = req.query;

  // If no URL is provided, just render the form without generating a QR code
  if (!url) {
    return res.render('index', { qrCodeSrc: null, url: null });
  }

  // Options for QR code generation
  const qrOptions = {
    errorCorrectionLevel: errorCorrectionLevel || 'M', // Default to 'M' (Medium) if not provided
    mode: mode || 'alphanumeric',  // Default to 'alphanumeric' mode
    scale: 3,  // Triple the size of the QR code
    margin: 2, // Optional: Add some margin around the QR code
  };

  // Generate QR code with the provided options
  qrcode.toDataURL(url, qrOptions, (err, src) => {
    if (err) {
      return res.status(500).send('Error generating QR Code');
    }

    // Render the page with the generated QR code
    res.render('index', { qrCodeSrc: src, url });
  });
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});