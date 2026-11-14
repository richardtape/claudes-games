// Line icons for weapons and organelles (24-unit box, currentColor).
const wrap = (body) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const ICONS = {
  antibody: wrap('<path d="M12 21v-9M12 12 5 4M12 12l7-8M8.5 12.5 3.5 7M15.5 12.5l5-5.5"/>'),
  lysozyme: wrap('<path d="M7 4c2 3 3 4.5 3 6a3 3 0 0 1-6 0c0-1.5 1-3 3-6ZM17 3c1.6 2.4 2.4 3.6 2.4 4.8a2.4 2.4 0 0 1-4.8 0C14.600 6.600 15.400 5.400 17 3ZM14 13c2.300 3.400 3.500 5.100 3.500 6.800a3.500 3.500 0 0 1-7 0c0-1.700 1.200-3.400 3.500-6.800Z"/>'),
  complement: wrap('<circle cx="12" cy="12" r="8.500"/><circle cx="12" cy="12" r="3"/><path d="M12 3.500v2.500M12 18v2.500M3.500 12H6M18 12h2.500"/>'),
  cytokine: wrap('<circle cx="12" cy="12" r="2" fill="currentColor"/><path d="M7.500 7.500a6.400 6.400 0 0 0 0 9M16.500 7.500a6.400 6.400 0 0 1 0 9M4.500 4.500a10.600 10.600 0 0 0 0 15M19.500 4.500a10.600 10.600 0 0 1 0 15"/>'),
  net: wrap('<path d="M12 3v18M3 12h18M5.600 5.600l12.800 12.800M18.400 5.600 5.600 18.400"/><path d="m12 7 3.500 1.500L17 12l-1.500 3.500L12 17l-3.500-1.500L7 12l1.500-3.500Z"/>'),
  peroxide: wrap('<circle cx="7" cy="16" r="4"/><circle cx="16" cy="9" r="3"/><circle cx="17.500" cy="18" r="1.800"/><circle cx="8" cy="6" r="1.500"/>'),
  interferon: wrap('<path d="M13.500 2 5 13.500h6L9.500 22 19 10h-6.200Z"/>'),
  fever: wrap('<path d="M12 3a2.500 2.500 0 0 0-2.500 2.500v8.300a4.500 4.500 0 1 0 5 0V5.500A2.500 2.500 0 0 0 12 3Z"/><path d="M12 9v8"/><circle cx="12" cy="17.500" r="1.300" fill="currentColor"/>'),
  mito: wrap('<rect x="2.500" y="6.500" width="19" height="11" rx="5.500"/><path d="M6 12l2-2.500 2.500 5 2.500-5 2.500 5 2-2.500"/>'),
  membrane: wrap('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5.500" stroke-dasharray="2 3"/>'),
  pseudopod: wrap('<path d="M4 14c0-4 3-6 6-6 1.500 0 2-3 5-4s5 2 4.500 4-3 2-3.500 4 2.500 3 1 6-6 3-9 2-4-3-4-6Z"/>'),
  receptor: wrap('<path d="M3 20h18M12 20v-7M12 13 7.500 7M12 13l4.500-6"/><circle cx="7" cy="5.500" r="1.800"/><circle cx="17" cy="5.500" r="1.800"/>'),
  lysosome: wrap('<path d="M20.500 8.500A9 9 0 1 0 20.500 15.500L12 12Z"/><circle cx="10" cy="7.500" r="1" fill="currentColor"/>'),
  golgi: wrap('<path d="M4 7c4-2.500 12-2.500 16 0M5.500 11.500c3.500-2 9.500-2 13 0M7 16c3-1.600 7-1.600 10 0M9 20c2-.9 4-.9 6 0"/>'),
  ribosome: wrap('<ellipse cx="12" cy="8" rx="5.500" ry="4"/><ellipse cx="12" cy="16.500" rx="7.500" ry="4.500"/>'),
  granule: wrap('<circle cx="8" cy="8" r="2.600" fill="currentColor"/><circle cx="16" cy="7" r="2" fill="currentColor"/><circle cx="12.500" cy="13" r="2.600" fill="currentColor"/><circle cx="7" cy="17" r="2" fill="currentColor"/><circle cx="17.500" cy="17" r="2.600" fill="currentColor"/>'),
  heal: wrap('<path d="M12 5v14M5 12h14" stroke-width="4"/>'),
  charge: wrap('<path d="M12 2v5M12 17v5M2 12h5M17 12h5M5 5l3.500 3.500M15.500 15.500 19 19M19 5l-3.500 3.500M8.500 15.500 5 19"/>'),
  lock: wrap('<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>'),
  sound: wrap('<path d="M4 9.500v5h3.500L12 19V5L7.500 9.500ZM16 9a4.500 4.500 0 0 1 0 6M18.500 6.500a8 8 0 0 1 0 11"/>'),
  mute: wrap('<path d="M4 9.500v5h3.500L12 19V5L7.500 9.500ZM16 9.500l5 5M21 9.500l-5 5"/>'),
  music: wrap('<path d="M9 18V6l11-2v12"/><circle cx="6.500" cy="18" r="2.500"/><circle cx="17.500" cy="16" r="2.500"/>'),
};
