/**
 * Script de scan automatique des images
 * Scanne /public/products et génère automatiquement imageManager.ts
 *
 * Usage: node scripts/scan-images.js
 */

const fs = require('fs');
const path = require('path');

// Chemins des dossiers
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const PRODUCTS_DIR = path.join(PUBLIC_DIR, 'products');
const OUTPUT_FILE = path.join(__dirname, '..', 'src', 'utils', 'imageManager.ts');

// Extensions d'images supportées
const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.svg', '.gif'];

/**
 * Scanne un dossier récursivement et retourne tous les fichiers images
 */
function scanDirectory(dir, baseDir = PUBLIC_DIR) {
  let images = [];

  try {
    const files = fs.readdirSync(dir, { withFileTypes: true });

    for (const file of files) {
      const fullPath = path.join(dir, file.name);

      if (file.isDirectory()) {
        // Récursion pour les sous-dossiers
        images = images.concat(scanDirectory(fullPath, baseDir));
      } else {
        // Vérifier si c'est une image
        const ext = path.extname(file.name).toLowerCase();
        if (IMAGE_EXTENSIONS.includes(ext)) {
          // Construire le chemin relatif depuis /public
          const relativePath = '/' + path.relative(baseDir, fullPath).replace(/\\/g, '/');
          images.push(relativePath);
        }
      }
    }
  } catch (error) {
    console.error(`Erreur lors du scan de ${dir}:`, error.message);
  }

  return images;
}

/**
 * Génère le contenu du fichier imageManager.ts
 */
function generateTypeScriptContent(images) {
  const sortedImages = images.sort();

  return `/**
 * Gestionnaire d'images pour l'admin produits
 *
 * ⚠️ CE FICHIER EST GÉNÉRÉ AUTOMATIQUEMENT
 * Ne pas modifier manuellement - Exécutez: npm run scan-images
 *
 * Dernière mise à jour: ${new Date().toLocaleString('fr-FR')}
 */

// Liste de toutes les images disponibles dans /public
export const productImages = ${JSON.stringify(sortedImages, null, 2)};

/**
 * Récupère la liste de toutes les images disponibles dans /public
 * Inclut à la fois les images dans /public/ et /public/products/
 */
export const getAllAvailableImages = (): string[] => {
  return productImages;
};

/**
 * Ajoute une nouvelle image à la liste (pour usage futur avec upload)
 */
export const addImageToList = (imagePath: string): void => {
  if (!productImages.includes(imagePath)) {
    productImages.push(imagePath);
  }
};

/**
 * Vérifie si une image existe dans la liste
 */
export const imageExists = (imagePath: string): boolean => {
  return productImages.includes(imagePath);
};

/**
 * Normalise le chemin de l'image (ajoute '/' au début si nécessaire)
 */
export const normalizeImagePath = (path: string): string => {
  if (!path) return '';
  return path.startsWith('/') ? path : \`/\${path}\`;
};

/**
 * Extrait le nom du fichier depuis le chemin complet
 */
export const getImageFileName = (path: string): string => {
  if (!path) return '';
  const segments = path.split('/');
  return segments[segments.length - 1];
};

/**
 * Catégorise les images par dossier
 */
export interface ImageCategory {
  category: string;
  images: string[];
}

export const getCategorizedImages = (): ImageCategory[] => {
  const categories: { [key: string]: string[] } = {};

  productImages.forEach(image => {
    const segments = image.split('/').filter(s => s);
    const category = segments.length > 1 ? segments[0] : 'root';

    if (!categories[category]) {
      categories[category] = [];
    }
    categories[category].push(image);
  });

  return Object.entries(categories).map(([category, images]) => ({
    category,
    images,
  }));
};

/**
 * Recherche d'images par nom
 */
export const searchImages = (query: string): string[] => {
  const lowerQuery = query.toLowerCase();
  return productImages.filter(image =>
    image.toLowerCase().includes(lowerQuery)
  );
};
`;
}

/**
 * Script principal
 */
function main() {
  console.log('🔍 Scan des images dans /public...\n');

  // Scanner le dossier /public/products
  let allImages = [];

  if (fs.existsSync(PRODUCTS_DIR)) {
    console.log('📁 Scan de /public/products/');
    const productsImages = scanDirectory(PRODUCTS_DIR);
    console.log(`   ✓ ${productsImages.length} images trouvées`);
    allImages = allImages.concat(productsImages);
  } else {
    console.log('⚠️  Dossier /public/products non trouvé');
  }

  // La racine de /public n'est volontairement PAS scannée : elle ne contient que des
  // ressources techniques (favicons, apple-touch-icon, og-image). Les proposer dans le
  // sélecteur d'images de l'admin permettait d'attribuer un favicon comme visuel de
  // produit, et elles échappent au passage en WebP fait par optimize-images.cjs.


  // Générer le fichier TypeScript
  console.log('📝 Génération de imageManager.ts...');
  const content = generateTypeScriptContent(allImages);

  fs.writeFileSync(OUTPUT_FILE, content, 'utf8');

  console.log(`✅ Fichier généré avec succès !`);
  console.log(`   Total: ${allImages.length} images`);
  console.log(`   Fichier: ${OUTPUT_FILE}\n`);

  // Afficher un aperçu des images trouvées
  if (allImages.length > 0) {
    console.log('📋 Images trouvées:');
    allImages.slice(0, 10).forEach(img => console.log(`   - ${img}`));
    if (allImages.length > 10) {
      console.log(`   ... et ${allImages.length - 10} autres\n`);
    }
  } else {
    console.log('⚠️  Aucune image trouvée!\n');
  }

  console.log('💡 Conseil: Relancez "npm run dev" pour voir les changements\n');
}

// Exécuter le script
main();
