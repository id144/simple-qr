const express = require('express');
const QRCode = require('qrcode');
const path = require('path');

// qrcode internals used to compute technical details about the generated symbol
const ECCode = require('qrcode/lib/core/error-correction-code');
const Mode = require('qrcode/lib/core/mode');
const Version = require('qrcode/lib/core/version');
const Utils = require('qrcode/lib/core/utils');
const AlignmentPattern = require('qrcode/lib/core/alignment-pattern');
const FormatInfo = require('qrcode/lib/core/format-info');

const app = express();

// Set EJS as the templating engine
app.set('view engine', 'ejs');

// Set the absolute path to the views directory
app.set('views', path.join(__dirname, '../views'));

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, '../public')));

// Middleware to parse form data
app.use(express.urlencoded({ extended: true }));

const DEFAULTS = { url: 'https://mozartmuseum.cz', errorCorrectionLevel: 'M', QRSize: 16 };
const QUIET_ZONE = 4; // qrcode library default margin, in modules

const EC_RECOVERY = { L: '~7%', M: '~15%', Q: '~25%', H: '~30%' };

const MASK_FORMULAS = [
  '(i + j) mod 2 = 0',
  'i mod 2 = 0',
  'j mod 3 = 0',
  '(i + j) mod 3 = 0',
  '(floor(i / 2) + floor(j / 3)) mod 2 = 0',
  '(i * j) mod 2 + (i * j) mod 3 = 0',
  '((i * j) mod 2 + (i * j) mod 3) mod 2 = 0',
  '((i + j) mod 2 + (i * j) mod 3) mod 2 = 0'
];

const pct = (part, whole) => (100 * part / whole).toFixed(1) + '%';

// Collect as many technical details as possible about a generated QR symbol
function describeQRCode(text, qr, eclName, scale, pngBytes, dataUrlLength, elapsedMs) {
  const version = qr.version;
  const ecl = qr.errorCorrectionLevel;
  const size = qr.modules.size;
  const totalModules = size * size;
  let darkModules = 0;
  for (const m of qr.modules.data) darkModules += m ? 1 : 0;

  // Codeword layout
  const totalCodewords = Utils.getSymbolTotalCodewords(version);
  const ecCodewords = ECCode.getTotalCodewordsCount(version, ecl);
  const dataCodewords = totalCodewords - ecCodewords;
  const blocks = ECCode.getBlocksCount(version, ecl);
  const ecPerBlock = ecCodewords / blocks;
  const blocksGroup2 = totalCodewords % blocks;
  const blocksGroup1 = blocks - blocksGroup2;
  const dataPerBlockGroup1 = Math.floor(dataCodewords / blocks);
  let blockStructure = `${blocksGroup1} × (${dataPerBlockGroup1} data + ${ecPerBlock} EC)`;
  if (blocksGroup2 > 0) {
    blockStructure += ` + ${blocksGroup2} × (${dataPerBlockGroup1 + 1} data + ${ecPerBlock} EC)`;
  }
  const correctableCodewords = blocks * Math.floor(ecPerBlock / 2);

  // Data bit stream
  const segments = qr.segments.map(seg => {
    const ccBits = Mode.getCharCountIndicator(seg.mode, version);
    const payloadBits = seg.getBitsLength();
    return {
      mode: seg.mode.id,
      length: seg.getLength(),
      modeBits: 4,
      charCountBits: ccBits,
      payloadBits,
      totalBits: 4 + ccBits + payloadBits
    };
  });
  const usedBits = segments.reduce((sum, s) => sum + s.totalBits, 0);
  const availableBits = dataCodewords * 8;
  const terminatorBits = Math.min(4, availableBits - usedBits);
  const bitPaddingBits = (8 - ((usedBits + terminatorBits) % 8)) % 8;
  const padCodewords = (availableBits - usedBits - terminatorBits - bitPaddingBits) / 8;

  const alignmentPatterns = AlignmentPattern.getPositions(version).length;
  const formatBits = FormatInfo.getEncodedBits(ecl, qr.maskPattern).toString(2).padStart(15, '0');
  const versionBits = version >= 7 ? Version.getEncodedBits(version).toString(2).padStart(18, '0') : null;

  const imageSide = (size + QUIET_ZONE * 2) * scale;

  return [
    {
      title: 'Input',
      rows: [
        ['Characters', text.length],
        ['UTF-8 bytes', Buffer.byteLength(text, 'utf8')],
        ['Encoding mode(s)', segments.map(s => s.mode).join(' + ')]
      ]
    },
    {
      title: 'Symbol',
      rows: [
        ['Version', `${version} (of 1–40)`],
        ['Size', `${size} × ${size} modules`],
        ['Total modules', totalModules],
        ['Dark modules', `${darkModules} (${pct(darkModules, totalModules)})`],
        ['Light modules', `${totalModules - darkModules} (${pct(totalModules - darkModules, totalModules)})`],
        ['Quiet zone', `${QUIET_ZONE} modules on each side`],
        ['Finder patterns', 3],
        ['Alignment patterns', alignmentPatterns],
        ['Mask pattern', `${qr.maskPattern}: ${MASK_FORMULAS[qr.maskPattern]}`],
        ['Format info bits', formatBits],
        ['Version info bits', versionBits || 'not present (version < 7)']
      ]
    },
    {
      title: 'Error correction',
      rows: [
        ['Level', `${eclName} (recovers ${EC_RECOVERY[eclName]} of codewords)`],
        ['Total codewords', totalCodewords],
        ['Data codewords', `${dataCodewords} (${pct(dataCodewords, totalCodewords)})`],
        ['EC codewords', `${ecCodewords} (${pct(ecCodewords, totalCodewords)})`],
        ['EC blocks', blocks],
        ['Block structure', blockStructure],
        ['Max correctable codewords', `${correctableCodewords} (${ecPerBlock / 2 | 0} per block)`],
        ['Reed–Solomon field', 'GF(256), polynomial x⁸ + x⁴ + x³ + x² + 1']
      ]
    },
    {
      title: 'Data stream',
      rows: [
        ...segments.map((s, i) => [
          `Segment ${i + 1} (${s.mode})`,
          `${s.length} ${s.mode === 'Byte' ? 'bytes' : 'chars'}: ${s.modeBits} mode + ${s.charCountBits} count + ${s.payloadBits} data = ${s.totalBits} bits`
        ]),
        ['Data capacity', `${availableBits} bits (${dataCodewords} bytes)`],
        ['Used by payload', `${usedBits} bits (${pct(usedBits, availableBits)})`],
        ['Terminator', `${terminatorBits} bits`],
        ['Bit padding', `${bitPaddingBits} bits`],
        ['Pad codewords', padCodewords],
        ['Capacity at this version/level', [Mode.NUMERIC, Mode.ALPHANUMERIC, Mode.BYTE]
          .map(m => `${Version.getCapacity(version, ecl, m)} ${m.id.toLowerCase()}`).join(', ')]
      ]
    },
    {
      title: 'Image',
      rows: [
        ['Format', 'PNG'],
        ['Pixels per module', scale],
        ['Image size', `${imageSide} × ${imageSide} px`],
        ['PNG file size', `${pngBytes.toLocaleString('en-US')} bytes`],
        ['Data URL length', `${dataUrlLength.toLocaleString('en-US')} chars`],
        ['Generation time', `${elapsedMs.toFixed(1)} ms`]
      ]
    }
  ];
}

// Handle both GET and POST requests on the root URL
app.all('/', async (req, res) => {
  if (req.method !== 'POST') {
    // Render the initial form with default values
    return res.render('index', { ...DEFAULTS, qrCodeUrl: null, stats: null, error: null });
  }

  // Keep the submitted values so the form can be re-used for the next iteration
  const url = req.body.url || '';
  const requestedLevel = String(req.body.errorCorrectionLevel || '').toUpperCase();
  const errorCorrectionLevel = EC_RECOVERY[requestedLevel] ? requestedLevel : DEFAULTS.errorCorrectionLevel;
  const parsedSize = parseInt(req.body.QRSize, 10);
  const QRSize = Number.isFinite(parsedSize) ? Math.min(32, Math.max(4, parsedSize)) : DEFAULTS.QRSize;
  const formValues = { url, errorCorrectionLevel, QRSize };

  if (!url) {
    return res.render('index', { ...formValues, qrCodeUrl: null, stats: null, error: 'Please provide a valid URL.' });
  }

  try {
    const started = process.hrtime.bigint();
    const qr = QRCode.create(url, { errorCorrectionLevel });
    const qrCodeUrl = await QRCode.toDataURL(url, {
      errorCorrectionLevel,
      version: qr.version,
      maskPattern: qr.maskPattern,
      margin: QUIET_ZONE,
      scale: QRSize
    });
    const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;
    const pngBytes = Buffer.from(qrCodeUrl.split(',')[1], 'base64').length;
    const stats = describeQRCode(url, qr, errorCorrectionLevel, QRSize, pngBytes, qrCodeUrl.length, elapsedMs);

    // Render the QR code, its technical details and the original input on the page
    res.render('index', { ...formValues, qrCodeUrl, stats, error: null });
  } catch (err) {
    console.error(err);
    res.render('index', { ...formValues, qrCodeUrl: null, stats: null, error: 'Failed to generate QR code: ' + err.message });
  }
});

// Export the app as a serverless function
module.exports = app;
