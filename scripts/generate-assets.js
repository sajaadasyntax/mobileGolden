const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const assetsDir = path.join(__dirname, '..', 'assets');

// Ensure assets directory exists
if (!fs.existsSync(assetsDir)) {
  fs.mkdirSync(assetsDir, { recursive: true });
}

// Create a simple icon with "G" letter
async function createIcon(size, outputPath) {
  const svg = `
    <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${size}" height="${size}" fill="#6366f1"/>
      <text x="50%" y="50%" font-family="Arial, sans-serif" font-size="${size * 0.6}" font-weight="bold" fill="white" text-anchor="middle" dominant-baseline="central">G</text>
    </svg>
  `;

  await sharp(Buffer.from(svg))
    .png()
    .toFile(outputPath);
}

async function generateAssets() {
  console.log('Generating app assets...');

  try {
    // Generate icon.png (1024x1024 for Expo)
    await createIcon(1024, path.join(assetsDir, 'icon.png'));
    console.log('✓ Generated icon.png');

    // Generate splash-icon.png (same as icon but can be different)
    await createIcon(1024, path.join(assetsDir, 'splash-icon.png'));
    console.log('✓ Generated splash-icon.png');

    // Generate adaptive-icon.png (1024x1024 for Android)
    await createIcon(1024, path.join(assetsDir, 'adaptive-icon.png'));
    console.log('✓ Generated adaptive-icon.png');

    // Generate favicon.png (512x512 for web)
    await createIcon(512, path.join(assetsDir, 'favicon.png'));
    console.log('✓ Generated favicon.png');

    console.log('\n✅ All assets generated successfully!');
  } catch (error) {
    console.error('Error generating assets:', error);
    process.exit(1);
  }
}

generateAssets();

