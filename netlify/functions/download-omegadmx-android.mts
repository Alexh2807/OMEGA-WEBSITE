/** Téléchargement direct de l'APK Android de la dernière version d'OMEGADMX. */
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
      'Cache-Control': cache ? 'public, max-age=600' : 'no-store',
    },
  });

export default async (_req: Request, _context: Context) => {
  try {
    const r = await fetch(API_URL, {
      headers: {
        'User-Agent': 'omegasud.fr',
        Accept: 'application/vnd.github+json',
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return redirect(FALLBACK_URL);

    const data = (await r.json()) as { assets?: GithubAsset[] };
    const assets = data.assets ?? [];
    const apk =
      assets.find(a => a.name.toLowerCase().endsWith('_android.apk')) ??
      assets.find(a => a.name.toLowerCase().endsWith('.apk'));

    // En cas d'APK absente, proposer les versions publiées, jamais l'installeur Windows.
    if (!apk) return redirect(FALLBACK_URL);
    return redirect(apk.browser_download_url, true);
  } catch (err) {
    console.error('download-omegadmx-android', err);
    return redirect(FALLBACK_URL);
  }
};
