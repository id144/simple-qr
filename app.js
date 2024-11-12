const express = require('express');
const path = require('path');
const qrcode = require('qrcode');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware to parse URL-encoded data
app.use(express.urlencoded({ extended: true }));

// Serve static files from the "public" directory
app.use(express.static(path.join(__dirname, 'public')));

// Render the homepage
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Generate QR code
app.post('/generate', (req, res) => {
  const { url, errorCorrectionLevel, mode } = req.body;

  if (!url) {
    return res.status(400).send('URL is required');
  }

  // Options for QR code generation
  const qrOptions = {
    errorCorrectionLevel: errorCorrectionLevel || 'M', // Default to 'M' (Medium) if not provided
    mode: mode || 'alphanumeric',  // Default to 'alphanumeric' mode
    scale: 9,  // Triple the size of the QR code
    margin: 2, // Optional: Add some margin around the QR code
  };

  // Generate QR code with the provided options
  qrcode.toDataURL(url, qrOptions, (err, src) => {
    if (err) {
      return res.status(500).send('Error generating QR Code');
    }

    // Send the QR code image back to the client
    res.send(`
      <h2>QR Code for:</br> <a href ="${url}">${url}</a></h2>
      <img src="${src}" alt="QR Code" style="image-rendering: pixelated;" />
      <br><br>
      <a href="/">Generate Another</a>
    `);
  });
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});