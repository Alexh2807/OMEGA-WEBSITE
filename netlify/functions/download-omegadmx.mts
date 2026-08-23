/**
 * Téléchargement direct d'OMEGADMX (Windows) — 302 vers l'installeur le plus
 * récent, sans jamais faire transiter le visiteur par une page intermédiaire.
 *
 * Chaque version publie un exécutable dont le NOM contient le numéro
 * (OMEGADMX_1.39.0_x64-setup.exe) : impossible d'utiliser le lien stable
 * GitHub `.../releases/latest/download/<nom fixe>`. On interroge donc
 * l'API « dernière release » du dépôt de releases et on redirige vers
 * l'URL réelle de l'asset .exe qu'elle contient.
 *
 * Le clic reste un téléchargement direct : une redirection HTTP vers un
 * fichier binaire ne fait jamais naviguer le navigateur vers « une autre
 * page », il enregistre le fichier.
 *
 * Cache-Control (10 min) : encaisse un pic de trafic sans cogner l'API
 * GitHub (60 req/h sans jeton pour toute l'adresse IP de Netlify), tout en
 * ne servant jamais un lien périmé plus de quelques minutes après une
 * nouvelle publication.
 */
import type { Context } from '@netlify/functions';

const REPO = 'Alexh2807/OmegaDMX-releases';
const API_URL = `https://api.github.com/repos/${REPO}/releases/latest`;
const FALLBACK_URL = `https://github.com/${REPO}/releases/latest`;

type GithubAsset = { name: string; browser_download_url: string };

const redirect = (location: string, cache = false) =>
  new Response(null, {
    status: 302,
    headers: {
      Location: location,
      ...(cache ? { 'Cache-Control': 'public, max-age=600' } : { 'Cache-Control': 'no-store' }),
    },
  });

export default async (_req: Request, _context: Context) => {
  try {
    const r = await fetch(API_URL, {
      headers: { 'User-Agent': 'omegasud.fr', Accept: 'application/vnd.github+json' },
    });
    if (!r.ok) return redirect(FALLBACK_URL);

    const data = (await r.json()) as { assets?: GithubAsset[] };
    const assets = data.assets ?? [];
    // Préfère l'installeur NSIS (-setup.exe) ; à défaut n'importe quel .exe publié.
    const exe =
      assets.find((a) => a.name.toLowerCase().endsWith('-setup.exe')) ??
      assets.find((a) => a.name.toLowerCase().endsWith('.exe'));

    if (!exe) return redirect(FALLBACK_URL);
    return redirect(exe.browser_download_url, true);
  } catch (err) {
    console.error('download-omegadmx', err);
    return redirect(FALLBACK_URL);
  }
};
