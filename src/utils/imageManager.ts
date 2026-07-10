/**
 * Gestionnaire d'images pour l'admin produits
 *
 * ⚠️ CE FICHIER EST GÉNÉRÉ AUTOMATIQUEMENT
 * Ne pas modifier manuellement - Exécutez: npm run scan-images
 *
 * Dernière mise à jour: 20/06/2026 07:35:07
 */

// Liste de toutes les images disponibles dans /public
export const productImages = [
  "/products/ChatGPT Image 25 juil. 2025, 00_53_57 copy copy.png",
  "/products/ChatGPT Image 25 juil. 2025, 00_53_57 copy.png",
  "/products/ChatGPT Image 25 juil. 2025, 00_53_57.png",
  "/products/El-Fuego-Sagrador.png",
  "/products/Hazer-co2-generated.png",
  "/products/HazerCO2remake.png",
  "/products/HazerCO2test.png",
  "/products/LiquideProHazer5L.png",
  "/products/Logo OMEGA Haute qualité copy copy.png",
  "/products/Logo OMEGA Haute qualité copy.png",
  "/products/Logo OMEGA Haute qualité.png",
  "/products/Logo-omega-hq-transparent.png",
  "/products/OMEGA-DMX-Interface.png",
  "/products/image-png.png",
  "/products/image.png",
  "/products/omega mousse 2.png",
  "/products/omega mousse.png",
  "/products/omega-dmx-soft-beams.png",
  "/products/omega-dmx-soft-dashboard.png",
  "/products/omega-dmx-soft-stage.png"
];

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
  return path.startsWith('/') ? path : `/${path}`;
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
