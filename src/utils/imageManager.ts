/**
 * Gestionnaire d'images pour l'admin produits
 *
 * ⚠️ CE FICHIER EST GÉNÉRÉ AUTOMATIQUEMENT
 * Ne pas modifier manuellement - Exécutez: npm run scan-images
 *
 * Dernière mise à jour: 03/08/2026 23:58:56
 */

// Liste de toutes les images disponibles dans /public
export const productImages = [
  "/products/el-fuego-sagrador.webp",
  "/products/hazer-co2-generated.webp",
  "/products/hazer-co2-remake.webp",
  "/products/hazer-co2-test.webp",
  "/products/image-png.webp",
  "/products/image.webp",
  "/products/liquide-pro-hazer-5l.webp",
  "/products/logo-omega-hq-transparent.webp",
  "/products/omega-dmx-interface.webp",
  "/products/omega-dmx-soft-3d.webp",
  "/products/omega-dmx-soft-beams.webp",
  "/products/omega-dmx-soft-color.webp",
  "/products/omega-dmx-soft-dash.webp",
  "/products/omega-dmx-soft-dashboard.webp",
  "/products/omega-dmx-soft-move.webp",
  "/products/omega-dmx-soft-plan2d.webp",
  "/products/omega-dmx-soft-stage.webp",
  "/products/omega-dmx-soft-stage3d.webp",
  "/products/omega-mousse-2.webp",
  "/products/omega-mousse.webp",
  "/products/placeholder.webp"
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
