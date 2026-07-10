/**
 * API pour scanner les images depuis l'interface admin
 * Exécute le script scan-images.cjs côté serveur
 */

/**
 * Déclenche le scan des images
 * Retourne la liste des images trouvées
 */
export const scanImages = async (): Promise<{
  success: boolean;
  images: string[];
  count: number;
  message: string;
}> => {
  try {
    // En développement, on simule le scan en lisant directement le dossier
    // Pour une vraie implémentation, il faudrait un endpoint backend

    // Pour l'instant, on recharge simplement le module imageManager
    // qui sera mis à jour après avoir exécuté npm run scan-images

    const response = await fetch('/api/scan-images', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    }).catch(() => {
      // Si l'API n'existe pas, on retourne un message d'instruction
      throw new Error('API non disponible');
    });

    if (!response.ok) {
      throw new Error('Erreur lors du scan');
    }

    const data = await response.json();
    return data;
  } catch (error) {
    // Fallback : demander à l'utilisateur d'exécuter manuellement
    return {
      success: false,
      images: [],
      count: 0,
      message: 'Pour scanner les images, exécutez "npm run scan-images" dans votre terminal.',
    };
  }
};

/**
 * Recharge dynamiquement la liste des images depuis imageManager
 * (après avoir exécuté npm run scan-images manuellement)
 */
export const reloadImagesList = async (): Promise<string[]> => {
  try {
    // Force le rechargement du module
    const module = await import('../utils/imageManager.ts?t=' + Date.now());
    return module.getAllAvailableImages();
  } catch (error) {
    console.error('Erreur rechargement images:', error);
    return [];
  }
};
