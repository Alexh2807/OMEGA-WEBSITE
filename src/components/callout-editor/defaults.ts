import { Callout, createCallout, PageCalloutsConfig, PAGE_ID } from './types';

/** Identifiants stables des zones photo éditables sur la page interface */
export const PHOTO_IDS = {
  dmxClose: 'dmxClose',
  antennes: 'antennes',
  sidePorts: 'sidePorts',
  antenneUsb: 'antenneUsb',
} as const;

export type PhotoId = (typeof PHOTO_IDS)[keyof typeof PHOTO_IDS];

export const PHOTO_LABELS: Record<PhotoId, string> = {
  dmxClose: 'Gros plan XLR (Univers 1 & 2)',
  antennes: 'Antennes RP-SMA',
  sidePorts: 'Face latérale DMX',
  antenneUsb: 'Antenne & USB-C',
};

const c = (p: Parameters<typeof createCallout>[0]): Callout => createCallout(p);

export const DEFAULT_PAGE_CALLOUTS: PageCalloutsConfig = {
  version: 1,
  pageId: PAGE_ID,
  photos: {
    [PHOTO_IDS.dmxClose]: [
      c({
        id: 'dmx_u1',
        x: 48,
        y: 58,
        label: 'Univers 1',
        sub: 'DMX OUT · 512 canaux',
        side: 'left',
        stretch: 18,
      }),
      c({
        id: 'dmx_u2',
        x: 67,
        y: 52,
        label: 'Univers 2',
        sub: 'DMX OUT · 512 canaux',
        side: 'right',
        stretch: 16,
      }),
    ],
    [PHOTO_IDS.antennes]: [
      c({
        id: 'ant_sma',
        x: 42,
        y: 40,
        label: 'Connecteur RP-SMA',
        sub: 'Antenne amovible, changeable en 2 s',
        side: 'right',
        stretch: 18,
      }),
      c({
        id: 'ant_choice',
        x: 26,
        y: 16,
        label: 'Antennes au choix',
        sub: 'Courte ou longue — selon la portée',
        side: 'left',
        stretch: 14,
      }),
    ],
    [PHOTO_IDS.sidePorts]: [
      c({
        id: 'side_u1',
        x: 83,
        y: 36,
        label: 'Univers 1',
        sub: 'XLR DMX OUT',
        side: 'left',
        stretch: 14,
      }),
      c({
        id: 'side_u2',
        x: 83,
        y: 58,
        label: 'Univers 2',
        sub: 'XLR DMX OUT',
        side: 'left',
        stretch: 14,
        labelDy: 6,
      }),
      c({
        id: 'side_ant',
        x: 50,
        y: 8,
        label: 'Antenne',
        sub: 'Sans fil OMEGA',
        side: 'left',
        stretch: 18,
      }),
    ],
    [PHOTO_IDS.antenneUsb]: [
      c({
        id: 'usb_ant',
        x: 40,
        y: 48,
        label: 'Antenne RP-SMA',
        sub: 'Interchangeable',
        side: 'left',
        stretch: 14,
      }),
      c({
        id: 'usb_port',
        x: 58,
        y: 60,
        label: 'USB-C',
        sub: 'Alim. / liaison PC',
        side: 'right',
        stretch: 16,
      }),
    ],
  },
};
